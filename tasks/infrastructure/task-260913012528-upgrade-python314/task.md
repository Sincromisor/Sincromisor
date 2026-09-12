# Python実行環境を3.14へ切り替える

## 背景 / 目的

[依存更新タスク](../task-260913012528-prepare-python314-dependencies/task.md)で移行前提を満たした後、現行サービスと開発環境のPythonを3.12から3.14へ更新する。

## 完了条件（受け入れ条件）

- [ ] ルートと現行ワークスペースのPython指定を`>=3.14,<3.15`と`.python-version`の3.14へ揃え、ロックを再生成する。
- [ ] Python 3.14でロックした依存の導入、既存Pythonテスト、YAMNetの音声分類、NeMo / ReazonSpeechの読み込みが通る。
- [ ] 開発環境の案内・コメントとPython規約を同期し、コンテナが共通のPython指定を使うことを確認する。

## スコープ境界

現行ワークスペース、uv.lock、開発環境セットアップ、関連文書を対象とする。廃止済みNue-ASRの再対応や稼働中コンテナの本番切り替えは含めない。

## 実装方針

既存のuvとルート`.python-version`を利用する。新しいバージョン切り替え機構は作らない。Python 3.14固有の実行時問題が再現した場合は影響箇所だけ修正する。

## テスト

`uv sync --locked --group dev --group full`、現行サービスの既存pytest、主要ライブラリのimportとYAMNetの無音分類を実行する。Ruff・tyによる対象確認を行い、既存由来の対象外不整合と区別する。

## ドキュメント同期の要否

`utils/setup-devenv/README.md`、同`setup.sh`のコメント、`documents/rules/coding-py.md`を同期する。コンテナはルートのPython指定をコピーする既存方式を維持する。
