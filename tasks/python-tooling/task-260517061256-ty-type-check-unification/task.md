# TASK-260517061256 ty type check unification

## Summary

Python の型チェックを mypy 併用から ty 前提へ寄せる。

## Scope

- dev 依存を mypy から ty へ切り替える。
- `speech-recognizer` (nue) は upstream サポート終了により ty 対象外にする。
- Python コーディング規約と AGENTS の型チェックコマンドを ty に統一する。
- ty 対象範囲で検出された既存診断を、実装側の型情報で解消する。

## Verification

- `uv run --group dev --group full ty check .`
