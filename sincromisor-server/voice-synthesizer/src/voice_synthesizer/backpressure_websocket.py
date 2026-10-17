"""音声合成の受信抑制に生存確認を連動させ、合成中の誤切断を防ぐ。

Uvicorn 0.54.0のSansIOは受信停止中もPong期限を進めるため、この接続だけを補正する。
上流が受信停止・再開とPing待機の破棄を連動させ、本モジュールの回帰試験を通れば置換できる。
メッセージ容量、受信キュー、Close交渉は上流に委ね、内部フックへの依存をここへ限定する。
"""

from uvicorn._types import ASGIReceiveEvent, ASGISendEvent
from uvicorn.protocols.websockets.websockets_sansio_impl import WebSocketsSansIOProtocol


class BackpressureWebSocketProtocol(WebSocketsSansIOProtocol):
    """接続所有のタイマーを受信停止時に回収し、受信再開後にだけ監視を始め直す。"""

    def send_receive_event_to_app(self) -> None:
        """既存の要求キューと受信停止を維持し、読めないPongの待機を破棄する。"""
        super().send_receive_event_to_app()
        if self.read_paused:
            self.stop_keepalive()
            # 停止前の往復時間で再開後のPing間隔を短縮しない。
            self.last_ping_rtt = 0.0

    async def receive(self) -> ASGIReceiveEvent:
        """上流がキューを空にして受信を再開したら、新しいPingを予約する。"""
        message = await super().receive()
        if message["type"] != "websocket.disconnect":
            # 破棄したPingのPongは、上流の新しいペイロードとの照合で無視される。
            self.start_keepalive()
        return message

    def schedule_ping(self) -> None:
        """終了・停止中と予約済みの接続を除き、同じループの単調時計で予約する。"""
        # receive、accept、Pong処理から呼ばれるため、Ping間隔とPong期限の両方を確認する。
        if (
            not self.handshake_complete
            or self.read_paused
            or self.close_sent
            or self.disconnected
            or self.transport.is_closing()
            or self.ping_timer is not None
            or self.pong_timer is not None
        ):
            return
        super().schedule_ping()

    async def send(self, message: ASGISendEvent) -> None:
        """通常のClose交渉でも監視を回収し、交渉中の受信再開では監視を戻さない。"""
        try:
            await super().send(message)
        finally:
            # 切断とサーバー停止は上流のconnection_lost / shutdownでも同じ回収を行う。
            if self.close_sent or self.disconnected or self.transport.is_closing():
                self.stop_keepalive()
