# Mastra APIとStudio Editorを同梱し会話文脈を隔離する

## 背景 / 目的

Difyに代わるAPIとローカル管理者用の編集画面を1サービスで提供する。シングルユーザー前提を維持し、会話文脈だけをセッション単位で隔離する。
前提は [task-260915031109-gemma4-llama-server](../../infrastructure/task-260915031109-gemma4-llama-server/task.md)。

## 完了条件

- [ ] ビルド済みMastra APIとStudio Editorが同じコンテナで起動し、Gemma 4 E2Bのストリーミング応答を取得できる。
- [ ] 同一セッションの次の発話は履歴を参照し、別セッションとStudioの試験会話には混入しない。
- [ ] 管理者がStudioで指示を編集・試験・公開でき、APIへ反映され、コンテナ再作成後も保持される。
- [ ] Studio・管理APIはローカル管理者向けに限定し、未認証で構成を変更できない。
- [ ] Python側が使うAPIパス、要求、本文・正常終端・失敗イベントを採用バージョンの実HTTP応答で確認し、設計へ記録する。

## 設計判断

- 追加予定の `sincromisor-server/agent-server/` にTypeScriptプロジェクトを置く。Mastra、Editor、Memory、libSQLの必要な依存とロックファイルを保持する。
- `mastra build --studio` 相当の本番ビルドを配備する。クラウドやEEのAgent Builderを必須にしない。
- コードで標準エージェント `sincromisor-character` を1つ定義し、既存READMEの日本語会話・先頭 `^N` 表情指示を初期値にする。Studio Editorは指示を編集し、モデル・識別子・実行設定はコードで管理する。
- 前提タスクのllama-serverへ直接接続する。追加ゲートウェイは作らない。
- Memoryの `resource` は固定のローカル用識別子、`thread` は `sincromisor:${session_id}` とする。会話側は新しい発話だけを送る。
- セッションを跨ぐworking memory、semantic recall、observational memoryは有効化しない。会話の再接続による履歴復元と長期記憶は対象外。
- 設定と会話履歴は単一のローカルlibSQLを専用永続ボリュームに保存する。初期化で公開済み指示を上書きしない。
- 新サービス `agent-server` は `chat` プロファイル、内部待受 `0.0.0.0:4111`、ホスト公開 `127.0.0.1:4111` とする。公開フロントから管理画面へ転送しない。
- ルート `.env` から管理者トークン、LLM URL・モデル識別子をCompose経由で設定読込へ渡す。例は `examples/compose.env` に置き、固定の例示トークンを実運用の既定値にしない。
- 管理者用の単純な認証を使う。会話ユーザー登録、RBAC、ユーザー別OAuthは追加しない。
- 標準のMastraストリーミングAPIを優先する。HTTP切断の取消伝播が不足する場合だけ同一サービス内の最小ルートで補う。応答の所有者が取消を生成へ渡し、途中切断を成功にしない。
- 会話全体を自動再試行しない。API・ライブラリの再試行既定値も確認する。死活確認は採用版のエンドポイントとイメージ内の実行可能コマンドで定義し、設定不足・起動失敗を検出する。

## 変更範囲と文書

- 新サービス、`Docker/agent-server/`、追加予定の `compose/agent-server.yml`、`compose.yml`、設定サンプル。
- 追加予定の `documents/design/backend/services/agent-server.md` にAPI・セッション・保存・認証・取消の契約を記録し、[設計索引](../../../documents/design/index.md) から辿れるようにする。
- [Compose設計](../../../documents/design/infrastructure/compose.md)、[保存領域設計](../../../documents/design/infrastructure/storage.md) を同期する。
- Python切替、MCP、複数エージェント、新規作成UIは対象外。

## 確認方法

- 型確認、本番ビルド、例示設定でComposeを確認する。
- 2セッションを交互に呼ぶ再実行可能な確認で投入履歴のthread分離を確認する。LLMの偶然の応答だけで隔離を判定しない。
- 実GemmaのHTTP応答と取消を確認し、Pythonへ引き継げる秘密情報なしの最小イベント例を残す。
- Studioの編集・試験・公開、再作成後の保持、未認証での変更拒否、ループバック公開を確認する。ブラウザー操作はplaywright-cliスキルに従う。

## 外部参照

確認日: 2026-09-15。コード定義エージェントのEditor編集、ローカル保存、標準APIを採用する。

- [Studioの配備](https://mastra.ai/docs/studio/deployment)
- [Editor](https://mastra.ai/docs/studio/editor)
- [Studio認証](https://mastra.ai/docs/studio/auth)
- [ローカルモデル](https://mastra.ai/models#use-local-models-with-mastra)
- [会話履歴](https://mastra.ai/docs/memory/message-history)
