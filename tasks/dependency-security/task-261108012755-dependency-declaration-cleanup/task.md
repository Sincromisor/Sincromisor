# 外部依存の使用箇所と宣言を整理

## 背景と目的

外部ライブラリ群の依存関係の確認とクリーンアップの依頼に対応する。
依存宣言を実際の使用箇所と照合し、未使用・重複宣言と、推移依存の導入に頼った直接参照を整理する。

## 完了条件

- [x] npm、Python、Goの依存定義と使用箇所を確認する。
- [x] 未使用・重複宣言を除去し、直接使う依存の宣言漏れを補う。
- [x] ロックファイルを同期し、既存の外部パッケージのバージョンを維持する。
- [x] 変更対象の検査とテスト結果を記録する。

## 変更内容と判断

- ルートの開発依存から、ソース・起動処理で使われていない `python-dotenv` を削除する。Pythonのロックは202パッケージから201パッケージになる。
- `tool.uv.workspace.members` の `sincro-models` 重複登録を削除する。
- Python各サービスで直接使う `pydantic`、`starlette`、`botocore`、`omegaconf`、`torch` を該当サービスの依存に明記する。下限には既存ロックのバージョンを使う。
- AgentServerのテストが直接使う `@libsql/client` と `@mastra/deployer` を開発依存として明記する。バージョンは既存ロックと同じ値に固定する。
- フロントエンドとAgentServerの本番依存は使用されているため保持する。Goは `go mod tidy -diff` に差分がなく、変更しない。
- `websockets` はUvicornのWebSocket実装、`sudachidict-full` はSudachiの辞書として必要なため保持する。MediaPipeは発話終端の比較評価専用グループに残す。
- 制約・上書き設定は維持する。バージョン更新、脆弱性監査、Docker資源・保存データの削除は今回の対象外とする。

## 確認結果

- Python全6パッケージのソースと起動ファイルをASTで解析し、直接importと依存宣言の対応を確認した。比較評価CLIのMediaPipeは専用グループとして確認した。
- PythonとAgentServerのロックを変更前と比較し、削除した `python-dotenv` 以外の外部パッケージ情報が変わっていないことを確認した。
- `uv lock --check --offline`: 成功。
- ルートとAgentServerの `npm ls --all --package-lock-only --ignore-scripts`: 成功。
- Goの `go mod tidy -diff` と `go mod verify`: 成功。
- `uv sync --locked --all-groups` と `uv pip check`: 成功。仮想環境もロックに同期した。
- AgentServerの `npm run check` と `npm test`: 成功、12テスト合格。
- `uv run --locked --all-groups python -m pytest` で変更した4サービスの `tests/` を検査し、248テストと7副テストが合格、4件がスキップ。スキップは実モデル・上流原本との比較および中央ログ結合試験の専用条件による。
- AgentServerのJSONに対するBiome、タスク文書のPrettier、`git diff --check`、タスク管理検査: 成功。

## 文書同期

通信契約、設定、サービスの実行時の振る舞いは変更しないため、設計文書の更新は不要。
