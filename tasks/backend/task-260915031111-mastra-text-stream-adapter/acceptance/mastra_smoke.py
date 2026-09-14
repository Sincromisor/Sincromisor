"""実Mastra・Gemmaへ処理担当を接続し、複数ターンと切断による生成停止を確認する。"""

import argparse
import asyncio
import json
from uuid import uuid4

from dotenv import dotenv_values
from fastapi import WebSocketDisconnect
from sincro_models import (
    ChatHistory,
    ChatMessage,
    TextProcessorRequest,
    TextProcessorResult,
)
from text_processor.mastra_worker import MastraTextProcessorWorker


def request(session_id: str, text: str) -> TextProcessorRequest:
    """表示用履歴を持たない発話を作り、Mastra側だけで文脈を復元させる。"""
    message = ChatMessage(
        speech_id=1,
        message_type="user",
        speaker_id="user",
        speaker_name="試験",
        message=text,
    )
    return TextProcessorRequest(
        session_id=session_id,
        confirmed=True,
        history=ChatHistory(messages=[message]),
        request_message=message,
    )


async def processing() -> bool:
    """内部公開のllamaスロットから、生成が残っているかを調べる。"""
    process = await asyncio.create_subprocess_exec(
        "docker",
        "exec",
        "sincromisor-llama-server-1",
        "curl",
        "-fsS",
        "http://127.0.0.1:8080/slots",
        stdout=asyncio.subprocess.PIPE,
    )
    stdout, _ = await process.communicate()
    assert process.returncode == 0
    return any(slot["is_processing"] for slot in json.loads(stdout))


async def run(base_url: str, token: str) -> None:
    """同じthreadの記憶と、送受信失敗時の下流停止を直接確認する。"""
    worker = MastraTextProcessorWorker(base_url, token, "sincromisor-character")
    session_id = str(uuid4())
    for text in [
        "合言葉は『青い桃891』です。覚えたとだけ答えて。",
        "さっきの合言葉を答えて。",
    ]:
        results = [
            result.model_copy(deep=True)
            async for result in worker.process_async(request(session_id, text))
        ]
        assert results[-1].end_of_response
        assert (
            "".join(result.voice_text or "" for result in results)
            == results[-1].response_message.message
        )
        print(results[-1].response_message.message)
    assert "青い桃891" in results[-1].response_message.message

    for failure in ["disconnect", "send"]:
        await cancel(worker, failure)


async def cancel(worker: MastraTextProcessorWorker, failure: str) -> None:
    """一要求の送受信失敗を起こし、生成中のスロットが停止するまで確認する。"""
    sent = asyncio.Event()

    class WebSocket:
        calls = 0

        async def receive_bytes(self) -> bytes:
            self.calls += 1
            if self.calls == 1:
                return request(
                    str(uuid4()),
                    "1から1000まで番号を付けて、一行ずつ別の短い日本語の文を句点付きで書いて。途中でまとめないで。",
                ).to_msgpack()
            await sent.wait()
            if failure == "disconnect":
                raise WebSocketDisconnect(code=1000)
            await asyncio.Future()
            raise AssertionError("取消後は受信しない")

        async def send_bytes(self, pack: bytes) -> None:
            assert not TextProcessorResult.from_msgpack(pack).end_of_response
            assert await processing(), "切断前にはllamaが生成中である必要がある"
            sent.set()
            if failure == "send":
                raise RuntimeError("intentional send failure")

    try:
        await worker.communicate(WebSocket())
    except WebSocketDisconnect, RuntimeError:
        pass
    else:
        raise AssertionError("WebSocket failure must propagate")
    async with asyncio.timeout(5):
        while await processing():
            await asyncio.sleep(0.1)
    print(f"{failure}: llama generation stopped")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--url", default="http://127.0.0.1:4111")
    args = parser.parse_args()
    token = dotenv_values(args.env_file).get("SINCRO_AGENT_ADMIN_TOKEN")
    if not token:
        raise ValueError("SINCRO_AGENT_ADMIN_TOKEN is required.")
    asyncio.run(run(args.url, token))
