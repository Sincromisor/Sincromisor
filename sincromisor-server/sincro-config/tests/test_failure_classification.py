"""実ライブラリ例外の分類と、例外本文・要求情報の非出力を確認する。"""

import asyncio
import errno
import json

import pytest
import requests
from botocore.exceptions import ClientError, EndpointConnectionError
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError
from sincro_config.runtime_diagnostics import failure_fields


@pytest.mark.parametrize(
    ("error", "reason", "phase"),
    [
        (requests.exceptions.ReadTimeout("secret-body"), "timeout", "read"),
        (requests.exceptions.ConnectTimeout("secret-body"), "timeout", "connect"),
        (RedisTimeoutError("secret-body"), "timeout", None),
        (RedisConnectionError("secret-body"), "connection_failed", None),
        (
            EndpointConnectionError(endpoint_url="http://secret-body"),
            "connection_failed",
            None,
        ),
        (PermissionError("secret-body"), "permission_denied", None),
        (FileNotFoundError("secret-body"), "not_found", None),
        (OSError(errno.ENOSPC, "secret-body"), "disk_full", None),
        (asyncio.CancelledError("secret-body"), "cancelled", None),
        (RuntimeError("secret-body"), "failed", None),
    ],
)
def test_real_exception_classification(error, reason, phase):
    fields = failure_fields(error)
    assert fields["reason"] == reason
    assert fields.get("timeout_phase") == phase
    assert fields["exception_type"] == type(error).__name__
    assert "secret-body" not in json.dumps(fields)


@pytest.mark.parametrize("status", [401, 403, 404, 500])
def test_http_and_s3_safe_fields(status):
    response = requests.Response()
    response.status_code = status
    response.url = "http://secret-body"
    for error in [
        requests.HTTPError("secret-body", response=response),
        ClientError(
            {
                "Error": {"Code": "secret-body", "Message": "secret-body"},
                "ResponseMetadata": {"HTTPStatusCode": status},
            },
            "secret-body",
        ),
    ]:
        fields = failure_fields(error)
        assert fields["http_status"] == status
        assert fields["reason"] == {
            401: "permission_denied",
            403: "permission_denied",
            404: "not_found",
        }.get(status, "http_failure")
        assert "secret-body" not in json.dumps(fields)
    fields = failure_fields(
        ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "secret-body"}}, "secret-body"
        )
    )
    assert fields["error_code"] == "AccessDenied"
    assert fields["reason"] == "permission_denied"
