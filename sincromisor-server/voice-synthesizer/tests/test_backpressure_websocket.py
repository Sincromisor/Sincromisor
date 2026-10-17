"""単調時計を進め、受信停止・古いPong・接続終了の境界を確認する。"""

import asyncio
from unittest.mock import Mock

import pytest
from uvicorn import Config
from uvicorn.server import ServerState
from voice_synthesizer.backpressure_websocket import BackpressureWebSocketProtocol
from websockets.frames import Frame, Opcode


class Clock:
    def __init__(self, loop):
        self.loop = loop
        self.now = 100.0
        self.timers = []

    def call_later(self, delay, callback):
        handle = asyncio.TimerHandle(self.now + delay, callback, (), self.loop)
        self.timers.append((handle, callback))
        return handle

    def advance(self, seconds):
        end = self.now + seconds
        while due := [
            h for h, _ in self.timers if not h.cancelled() and h.when() <= end
        ]:
            handle = min(due, key=lambda h: h.when())
            callback = next(cb for h, cb in self.timers if h is handle)
            self.now = handle.when()
            handle.cancel()
            callback()
        self.now = end

    def active(self):
        return [h for h, _ in self.timers if not h.cancelled()]


def protocol_and_clock(monkeypatch, *, ping_timeout=5):
    loop = asyncio.get_running_loop()
    clock = Clock(loop)
    config = Config(Mock(), ws_ping_interval=10, ws_ping_timeout=ping_timeout)
    protocol = BackpressureWebSocketProtocol(config, ServerState(), {}, _loop=loop)
    monkeypatch.setattr(loop, "time", lambda: clock.now)
    monkeypatch.setattr(loop, "call_later", clock.call_later)
    protocol.conn = Mock(data_to_send=list)
    protocol.transport = Mock(is_closing=Mock(return_value=False))
    protocol.transport.close.side_effect = lambda: setattr(
        protocol.transport.is_closing, "return_value", True
    )
    protocol.connections.add(protocol)
    protocol.handshake_complete = True
    protocol.start_keepalive()
    return protocol, clock


def enqueue(protocol):
    protocol.frames = [b"fixture"]
    protocol.send_receive_event_to_app()


def test_pause_after_ping_discards_deadline_and_stale_pong(monkeypatch):
    async def run():
        protocol, clock = protocol_and_clock(monkeypatch)
        clock.advance(10)
        old = protocol.pending_ping_payload
        deadline = protocol.pong_timer
        enqueue(protocol)
        enqueue(protocol)
        assert protocol.read_paused
        assert deadline.cancelled()
        assert protocol.pending_ping_payload is None
        assert not clock.active()
        clock.advance(100)
        protocol.conn.fail.assert_not_called()
        await protocol.receive()
        assert protocol.read_paused
        assert not clock.active()
        await protocol.receive()
        assert not protocol.read_paused
        assert len(clock.active()) == 1
        protocol.start_keepalive()
        assert len(clock.active()) == 1
        clock.advance(10)
        current = protocol.pending_ping_payload
        assert current is not None
        assert current != old
        assert protocol.ping_sent_at == clock.now
        deadline = protocol.pong_timer
        protocol.handle_pong(Frame(Opcode.PONG, old))
        assert protocol.pong_timer is deadline
        assert not deadline.cancelled()
        clock.advance(1)
        protocol.handle_pong(Frame(Opcode.PONG, current))
        assert protocol.last_ping_rtt == 1
        assert deadline.cancelled()
        assert len(clock.active()) == 1
        for _ in range(3):
            enqueue(protocol)
            assert not clock.active()
            clock.advance(100)
            await protocol.receive()
            assert len(clock.active()) == 1
        protocol.stop_keepalive()
        assert not clock.active()

    asyncio.run(run())


def test_readable_peer_without_pong_times_out(monkeypatch):
    async def run():
        protocol, clock = protocol_and_clock(monkeypatch)
        clock.advance(14.9)
        protocol.conn.fail.assert_not_called()
        clock.advance(0.1)
        protocol.conn.fail.assert_called_once_with(1011, "keepalive ping timeout")
        assert protocol.close_sent
        assert protocol.transport.is_closing()
        assert not clock.active()
        assert protocol.pending_ping_payload is None
        protocol.connection_lost(None)
        await protocol.receive()
        assert not clock.active()

    asyncio.run(run())


@pytest.mark.parametrize("paused", [False, True])
@pytest.mark.parametrize("ending", ["close", "lost", "peer", "shutdown"])
def test_connection_end_never_restarts_keepalive(monkeypatch, paused, ending):
    async def run():
        protocol, clock = protocol_and_clock(monkeypatch)
        clock.advance(10)
        if paused:
            enqueue(protocol)
        if ending == "close":
            await protocol.send({"type": "websocket.close", "code": 1000})
        elif ending == "shutdown":
            protocol.shutdown()
        elif ending == "peer":
            protocol.conn.close_rcvd = Mock(code=1000, reason="")
            protocol.handle_close(Frame(Opcode.CLOSE, b"\x03\xe8"))
        if ending in {"close", "shutdown"}:
            while not protocol.queue.empty():
                await protocol.receive()
            assert protocol.ping_timer is protocol.pong_timer is None
            assert protocol.pending_ping_payload is None
        protocol.connection_lost(None)
        while not protocol.queue.empty():
            await protocol.receive()
        protocol.start_keepalive()
        clock.advance(100)
        assert protocol.ping_timer is protocol.pong_timer is None
        assert protocol.pending_ping_payload is None
        assert not clock.active()
        assert protocol.conn.send_ping.call_count == 1
        assert protocol not in protocol.connections

    asyncio.run(run())


def test_no_pong_deadline_keeps_one_ping_timer(monkeypatch):
    async def run():
        protocol, clock = protocol_and_clock(monkeypatch, ping_timeout=None)
        for _ in range(3):
            clock.advance(10)
            protocol.handle_pong(Frame(Opcode.PONG, protocol.pending_ping_payload))
            assert len(clock.active()) == 1
        assert protocol.conn.send_ping.call_count == 3
        enqueue(protocol)
        assert not clock.active()
        await protocol.receive()
        assert len(clock.active()) == 1
        protocol.connection_lost(None)

    asyncio.run(run())
