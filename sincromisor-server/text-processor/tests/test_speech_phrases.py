"""固定SSEの受信境界、数値、短い句と異常終端での本文保存を確認する。"""

import asyncio

import pytest
from test_mastra_stream import DONE, FINISH, _event, _request, _server
from text_processor.mastra_client import MastraResponseError
from text_processor.mastra_worker import MastraTextProcessorWorker
from text_processor.speech_phrases import SpeechPhrases

CASES = [
    (
        "^2はい、今日は、晴れです。一緒に、散歩しましょう。",
        ["^2はい、", "今日は、晴れです。", "一緒に、散歩しましょう。"],
    ),
    ("値は3.14で、1,234.5円です。", ["値は3.14で、", "1,234.5円です。"]),
    ("番号は3.次です。", ["番号は3.", "次です。"]),
    (
        "今日は天気がよいので公園を歩きながらゆっくりとお話ししましょう。",
        ["今日は天気がよいので公園を歩きながらゆっくりとお話ししましょう。"],
    ),
    ("^", ["^"]),
    ("^3", ["^3"]),
    ("はい、次は、末尾", ["はい、", "次は、末尾"]),
]


@pytest.mark.parametrize(("text", "expected"), CASES)
def test_every_text_boundary(text, expected):
    """全ての二分割位置と一文字入力でも同じ句列になり、本文を一字も落とさない。"""
    for parts in [
        [text],
        list(text),
        *[[text[:i], text[i:]] for i in range(len(text) + 1)],
    ]:
        phrases = SpeechPhrases()
        actual = [phrase for part in parts for phrase in phrases.feed(part)]
        if phrases.pending:
            actual.append(phrases.pending)
        assert actual == expected
        assert "".join(actual) == text


@pytest.mark.parametrize("width", [1, 2, 7, 1000])
def test_sse_boundaries_keep_expression_history_and_text(width):
    async def run():
        text, expected = CASES[0]
        events = (
            b"".join(_event("text-delta", {"text": ch}) for ch in text) + FINISH + DONE
        )
        async with _server(
            [events[i : i + width] for i in range(0, len(events), width)]
        ) as (url, _, _):
            worker = MastraTextProcessorWorker(
                url, "test-token", "sincromisor-character"
            )
            async with worker.mastra_client:
                results = [
                    r.model_copy(deep=True)
                    async for r in worker.process_async(_request())
                ]
        assert [r.voice_text for r in results if r.voice_text] == [
            expected[0][2:],
            *expected[1:],
        ]
        assert results[-1].response_message.message == text[2:]
        assert results[-1].response_message.expression_code == 2
        assert sum(r.end_of_response for r in results) == 1
        assert len(results[-1].history.messages) == 3

    asyncio.run(run())


@pytest.mark.parametrize("ending", [[], [FINISH], [_event("abort")], [_event("error")]])
def test_pending_short_phrase_is_not_flushed_on_failure(ending):
    async def run():
        async with _server(
            [_event("text-delta", {"text": "はい、次は、未完"}), *ending]
        ) as (url, _, _):
            worker = MastraTextProcessorWorker(
                url, "test-token", "sincromisor-character"
            )
            results = []
            async with worker.mastra_client:

                async def consume():
                    async for result in worker.process_async(_request()):
                        results.append(result.model_copy(deep=True))

                with pytest.raises(MastraResponseError):
                    await consume()
            assert [r.voice_text for r in results] == ["はい、"]
            assert all(
                not r.end_of_response and len(r.history.messages) == 2 for r in results
            )

    asyncio.run(run())


def test_first_phrase_is_immediate_and_following_comma_has_a_bound():
    phrases = SpeechPhrases()
    assert list(phrases.feed("はい、")) == ["はい、"]
    assert list(phrases.feed("次は、")) == []
    assert len("次は、歩いたら、") == 8
    assert list(phrases.feed("歩いたら、")) == ["次は、歩いたら、"]
    assert phrases.pending == ""
