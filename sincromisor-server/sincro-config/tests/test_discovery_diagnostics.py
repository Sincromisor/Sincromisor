"""Consul停止・復旧・候補なしを区別し、接続先や例外本文を診断へ複製しない。"""

import logging
from unittest.mock import MagicMock, patch

import pytest
from requests.exceptions import ConnectionError
from sincro_config.ServiceDiscoveryReferrer import (
    ServiceDiscoveryReferrer,
    ServiceDiscoveryReferrerError,
)
from sincro_config.ServiceDiscoveryReporter import ServiceDiscoveryReporter


def test_discovery_failure_and_recovery(caplog):
    """通信失敗を登録成功や候補なしと誤認せず、次の周期で再登録する。"""
    caplog.set_level(logging.INFO)
    consul = MagicMock()
    with patch("sincro_config.ServiceDiscoveryReporter.Consul", return_value=consul):
        reporter = ServiceDiscoveryReporter(
            "SpeechRecognizer", "localhost", 8500, "localhost", 8000
        )
    consul.agent.service.register.side_effect = [
        ConnectionError("private-url-token"),
        None,
    ]
    with (
        patch(
            "sincro_config.ServiceDiscoveryReporter.socket.gethostbyname",
            return_value="127.0.0.1",
        ),
        patch("sincro_config.ServiceDiscoveryReporter.atexit.register") as reserve,
        patch(
            "sincro_config.ServiceDiscoveryReporter.time.sleep",
            side_effect=[None, KeyboardInterrupt],
        ),
        pytest.raises(KeyboardInterrupt),
    ):
        reporter.run()
    rows = [record.msg for record in caplog.records if isinstance(record.msg, dict)]
    assert [row["outcome"] for row in rows] == [
        "started",
        "failed",
        "started",
        "success",
    ]
    assert rows[1]["reason"] == "connection_failed"
    assert reserve.call_count == 1
    consul.agent.service.deregister.side_effect = ConnectionError("private-url-token")
    reserve.call_args.args[0]("test-id")
    with patch("sincro_config.ServiceDiscoveryReferrer.Consul", return_value=consul):
        referrer = ServiceDiscoveryReferrer("localhost", 8500)
    consul.health.service.side_effect = [ConnectionError("private-url-token"), (1, [])]
    with pytest.raises(ServiceDiscoveryReferrerError):
        referrer.get_random_worker("SpeechRecognizer")
    assert referrer.get_random_worker("SpeechRecognizer") is None
    assert caplog.records[-1].msg["reason"] == "no_passing_instances"
    assert "private-" not in repr([record.msg for record in caplog.records])
