# 実装記録

- Python RTC stackとaiortc診断profileを削除し、既存Go実装・imageを`sincro-rtc`の通常pathへrenameした。通信payloadとMessagePack fixtureは変更していない。
- `uv run ruff check`は変更前からの範囲外違反110件でFAIL。削除後のworkspace解決は`uv lock --check`、MessagePack互換は`uv run --package sincro-models --group dev pytest sincromisor-server/sincro-models/tests/test_go_pipeline_protocol_compat.py`で確認する。
- VPSのrebuild / readiness / Consul / active session確認は、merge・push後に親担当が実施する。
