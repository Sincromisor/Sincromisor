"""Compose内の実LLMで日本語本文とツール結果の往復を確認する。秘密情報は使わない。"""

import json
import urllib.request

URL = "http://llama-server:8080/v1/chat/completions"


def request(messages, *, stream=False, tools=None):
    """HTTP応答の所有者へ返す。自動再試行せず、無受信の上限は120秒とする。"""
    body = {
        "model": "gemma-4-E2B-it",
        "messages": messages,
        "stream": stream,
        "temperature": 0,
        "max_tokens": 256,
    }
    if tools:
        body["tools"] = tools
    return urllib.request.urlopen(
        urllib.request.Request(
            URL,
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        ),
        timeout=120,
    )


def stream_text(messages):
    """正常終端とDONEを確認し、推論フィールドを本文へ混ぜずに集める。"""
    chunks = []
    finish = None
    done = False
    with request(messages, stream=True) as response:
        for line in response:
            if not line.startswith(b"data: "):
                continue
            data = line[6:].strip()
            if data == b"[DONE]":
                done = True
                break
            event = json.loads(data)
            for choice in event.get("choices", []):
                delta = choice["delta"]
                assert not delta.get("reasoning_content"), event
                chunks.append(delta.get("content") or "")
                finish = choice.get("finish_reason") or finish
    assert done and finish == "stop", (done, finish)
    text = "".join(chunks)
    assert text and "<think>" not in text, text
    return text


print("日本語ストリーミング:", stream_text([
    {"role": "user", "content": "日本語で、こんにちはと一文だけ挨拶してください。"},
]), flush=True)
messages = [
    {"role": "system", "content": "必要な情報はツールで調べ、日本語で短く回答してください。"},
    {"role": "user", "content": "確認用の合言葉をget_secret_wordツールで取得して教えてください。"},
]
tools = [{
    "type": "function",
    "function": {
        "name": "get_secret_word",
        "description": "無害な検証用の合言葉を取得する。引数は不要。",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}]
with request(messages, tools=tools) as response:
    choice = json.load(response)["choices"][0]
assert choice["finish_reason"] == "tool_calls", choice
message = choice["message"]
calls = message["tool_calls"]
assert len(calls) == 1 and calls[0]["function"]["name"] == "get_secret_word", calls
assert json.loads(calls[0]["function"]["arguments"]) == {}, calls
messages += [message, {
    "role": "tool", "tool_call_id": calls[0]["id"],
    "content": json.dumps({"word": "青空みかん742"}, ensure_ascii=False),
}]
answer = stream_text(messages)
assert "青空みかん742" in answer, answer
print("ツール実行: get_secret_word({}) / 結果回答:", answer, flush=True)
