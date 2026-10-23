"""段階的な区間拡大オプションのHTTP契約。"""

import pytest
from fastapi.testclient import TestClient
from test.unit.tts_pipeline.test_tts_engine import _gen_hello_hiho_query


def test_ramp_keeps_wav_response(client: TestClient) -> None:
    query = _gen_hello_hiho_query().model_dump()
    query["outputSamplingRate"] = 24000
    fixed = client.post("/streaming_synthesis", params={"speaker": 1}, json=query)
    ramp = client.post(
        "/streaming_synthesis",
        params={
            "speaker": 1,
            "segment_length": 0.3,
            "max_segment_length": 2.4,
        },
        json=query,
    )
    assert fixed.status_code == ramp.status_code == 200
    assert ramp.headers["content-type"] == "audio/wav"
    assert int(ramp.headers["content-length"]) == len(ramp.content)
    assert ramp.content == fixed.content


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"max_segment_length": 0.2}, 400),
        ({"max_segment_length": 0}, 422),
        ({"segment_length": 0.001}, 400),
    ],
)
def test_invalid_ramp_returns_error_before_wav(
    client: TestClient, params: dict[str, float], status: int
) -> None:
    response = client.post(
        "/streaming_synthesis",
        params={"speaker": 1, **params},
        json=_gen_hello_hiho_query().model_dump(),
    )
    assert response.status_code == status
    assert response.headers["content-type"] == "application/json"
