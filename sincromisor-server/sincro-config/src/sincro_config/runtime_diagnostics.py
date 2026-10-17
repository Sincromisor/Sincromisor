"""処理境界の例外を有限な原因へ分類する。本文・URL・キー・例外文字列は返さない。"""

import asyncio
import errno
import subprocess


def failure_fields(error: BaseException) -> dict[str, object]:
    """各サービスが操作・相手・IDに加える安全な原因。未知の例外はfailedに閉じる。"""
    reason = "failed"
    # 任意サービスの依存を共通設定へ追加せず、実例外の継承階層で既知分類を拾う。
    names = {cls.__name__ for cls in type(error).__mro__}
    timeout_phase = None
    if names & {"ConnectTimeout", "ConnectTimeoutError"}:
        timeout_phase = "connect"
    elif names & {"ReadTimeout", "ReadTimeoutError"}:
        timeout_phase = "read"
    if isinstance(error, (asyncio.CancelledError, GeneratorExit)):
        reason = "cancelled"
    elif isinstance(error, (TimeoutError, subprocess.TimeoutExpired)) or names & {
        "Timeout",
        "TimeoutError",
        "ReadTimeout",
        "ConnectTimeout",
        "ReadTimeoutError",
        "ConnectTimeoutError",
        "ServerTimeoutError",
    }:
        reason = "timeout"
    elif isinstance(error, PermissionError):
        reason = "permission_denied"
    elif isinstance(error, FileNotFoundError):
        reason = "not_found"
    elif isinstance(error, ConnectionError):
        reason = "connection_failed"
    elif isinstance(error, OSError) and error.errno == errno.ENOSPC:
        reason = "disk_full"
    elif type(error).__name__ in {
        "ConnectionError",
        "EndpointConnectionError",
        "ClientConnectionError",
        "ClientConnectorError",
        "ServerDisconnectedError",
        "ConnectionClosedError",
    }:
        reason = "connection_failed"
    elif type(error).__name__ in {
        "ValidationError",
        "ExtraData",
        "FormatError",
        "OutOfData",
        "UnicodeDecodeError",
    }:
        reason = "invalid_data"
    status = getattr(error, "status", None)
    response = getattr(error, "response", None)
    if isinstance(response, dict):
        metadata = response.get("ResponseMetadata")
        if isinstance(metadata, dict):
            status = metadata.get("HTTPStatusCode")
        details = response.get("Error")
        if isinstance(details, dict):
            code = details.get("Code")
            if code in {"NoSuchKey", "NotFound", "404"}:
                reason = "not_found"
            elif code in {
                "AccessDenied",
                "InvalidAccessKeyId",
                "SignatureDoesNotMatch",
                "403",
            }:
                reason = "permission_denied"
    if response is not None and not isinstance(response, dict):
        status = getattr(response, "status_code", status)
    result: dict[str, object] = {
        "reason": reason,
        "exception_type": type(error).__name__,
    }
    if timeout_phase is not None:
        result["timeout_phase"] = timeout_phase
    if isinstance(response, dict) and isinstance(details, dict):
        code = details.get("Code")
        if isinstance(code, str) and code in {
            "NoSuchKey",
            "NotFound",
            "404",
            "AccessDenied",
            "InvalidAccessKeyId",
            "SignatureDoesNotMatch",
            "403",
        }:
            result["error_code"] = code
    if type(status) is int and 100 <= status <= 599:
        result["http_status"] = status
        result["reason"] = {
            401: "permission_denied",
            403: "permission_denied",
            404: "not_found",
        }.get(status, "http_failure")
    return result


def stderr_fields(stderr: bytes) -> dict[str, object]:
    """最大64 KiBを調べ、既知診断だけを固定文へ置換する。未知の原文は一切返さない。"""
    text = stderr[:65536].lower()
    known = (
        b"invalid input",
        b"invalid data",
        b"unsupported",
        b"permission denied",
        b"no such file",
        b"out of memory",
        b"failed to open",
        b"error parsing",
    )
    diagnostic = "; ".join(word.decode("ascii") for word in known if word in text)
    return {
        "stderr_diagnostic": diagnostic or ("output_redacted" if stderr else "empty"),
        "stderr_truncated": len(stderr) > 65536,
    }
