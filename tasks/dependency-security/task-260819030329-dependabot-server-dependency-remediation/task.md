# Dependabot server dependency remediation

## 背景 / 目的

サーバー側の未解決 Dependabot alerts を確認し、NeMo / ReazonSpeech の互換性を維持したまま修正版へ更新する。

## 完了条件（受け入れ条件）

- [x] `transformers` 以外のサーバー側 Dependabot alerts が要求する修正版を `uv.lock` に解決する。
- [x] NeMo / ReazonSpeech の既存バージョンを維持し、更新後の NeMo テストと GPU import が成功する。
- [x] 更新できない alert と理由を記録する。

## 設計判断（着手前に確定済み）

既存の `tool.uv.constraint-dependencies` を脆弱性修正下限の正本として再利用する。`transformers 5.5.0` は `nemo-toolkit 3.0.0` への更新を伴うため対象外とする。

## スコープ境界

`pyproject.toml` と `uv.lock` の Python サーバー依存のみを対象とする。フロントエンド alert と NeMo 3 移行は対象外とする。

## 実装方針（既存コード整合: file:line）

`pyproject.toml` の直接依存と脆弱性下限を更新し、`uv lock --upgrade-package` で対象パッケージだけを再解決する。

## テスト

- `uv lock --check`
- server / speech-recognizer-nemo unit tests
- `Docker/speech-recognizer-nemo/Dockerfile` build と GPU import smoke test
- `git diff --check`, task tooling checks

## ドキュメント同期の要否

不要。公開 API、通信契約、設定項目は変更しない。
