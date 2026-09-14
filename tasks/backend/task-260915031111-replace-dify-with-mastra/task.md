# チャット生成をMastraへ切り替えDify依存を撤去する

## 背景 / 目的

準備済みのMastra処理担当をchatへ接続し、DifyなしでComposeからキャラクター会話とMCP拡張を利用する。
前提は [task-260915031110-mastra-admin-mcp](../../backend/task-260915031110-mastra-admin-mcp/task.md) と [task-260915031111-mastra-text-stream-adapter](../../backend/task-260915031111-mastra-text-stream-adapter/task.md)。

## 完了条件

- [ ] `chat` がMastraを使い、ComposeのGemma 4 E2Bで応答、音声合成、表示・表情連動が動く。
- [ ] 同一セッションの文脈を維持し、別セッションには混入しない。会話ユーザー認証は追加しない。
- [ ] 管理者が公開したStudio設定が反映され、無害なMCPツールの結果を使う応答を読み上げられる。
- [ ] `sincro` はMastra・LLM・MCPなしで利用できる。
- [ ] 実行コードと有効な設定・手順からDify依存を撤去し、設定変更の影響と起動手順を明記する。
- [ ] Difyの環境・履歴・資格情報は削除せず、Sincromisor側の切替だけを完了する。

## 設計判断

- [サービス入口](../../../sincromisor-server/text-processor/TextProcessorProcess.py) のchatでMastra処理担当を生成する。
- 設定は `SINCRO_PROCESSOR_MASTRA_URL`、`SINCRO_PROCESSOR_MASTRA_TOKEN`、`SINCRO_PROCESSOR_MASTRA_AGENT_ID`。URL例は `http://agent-server:4111`、エージェントは `sincromisor-character` とし、API接頭辞は前提タスクの契約に従う。
- 管理者トークンは前提タスクと整合させ、会話ユーザー単位の発行・権限分離を追加しない。
- `.env` → `compose/text-processor.yml` → `TextProcessorProcessArgument` → 処理担当を同期する。`examples/compose.env` に空の資格情報と起動例を置き、利用者の `.env` は上書きしない。
- `SINCRO_PROCESSOR_DIFY_URL` / `SINCRO_PROCESSOR_DIFY_TOKEN` と旧CLI引数の廃止は破壊的な設定変更として明示する。二重実装や自動フォールバックは残さない。
- チャット起動例は `COMPOSE_PROFILES=full,chat` とする。`full` のみのsincroとrtc専用起動を維持し、text-processorへチャットサービスへの無条件の起動依存を加えない。
- GoとのWebSocket・MessagePack、フロントRTC契約、異常時の未確定と接続終了は維持する。
- 切替前に会話を終了し、切替後は新しいセッションを開始する。旧Dify履歴・プラグインの自動移行は行わない。

## 変更範囲と文書

- `sincromisor-server/text-processor/TextProcessorProcess.py`、設定クラス、公開インポート、不要な `Dify/`、Dify処理担当・専用テスト。共通の確認はMastraテストへ残す。
- `compose/text-processor.yml`、`examples/compose.env`、必要なCompose依存指定。
- [README](../../../README.md)、[TextProcessor設計](../../../documents/design/backend/services/text-processor.md)、[Compose設計](../../../documents/design/infrastructure/compose.md)、[構成概要](../../../documents/design/architecture/overview.md)、[イメージ公開手順](../../../documents/design/infrastructure/image-publishing.md)、[AGENTS.md](../../../AGENTS.md) の現在有効なDify前提を同期する。
- `documents/design/backend/services/agent-server.md` と [設計索引](../../../documents/design/index.md) の最終構成を確認する。
- 過去タスク・archiveは残す。Difyホストの停止・削除、保存データの削除・変換は対象外。

## 確認方法

- 対象PythonのRuff・型確認、Mastra処理担当と既存sincroのテスト、例示設定でComposeを確認する。
- 開発環境で `full,chat` を起動し、ブラウザーで通常会話、同一セッションの続き、別セッション、MCPを使う会話を確認する。Studioの指示変更・公開を1回反映する。
- 音声・表示への推論・ツール入力の混入がないこと、切断時の生成停止を確認する。ブラウザー操作はplaywright-cliスキルに従う。
- チャット追加サービスを起動しないsincroを1回確認する。
- `rg` で現行コード・設定・有効文書のDify参照を確認し、履歴と移行説明以外の取り残しを解消する。
- 共有環境を変更した場合は、失敗調査に必要なログと設定識別を先に残し、使用中のサービスを元の状態へ復旧する。必須確認が失敗したまま完了しない。

## 実行状況

依存するMCPタスクが認証設定方法の判断待ちのため、切替・Dify撤去は未着手。
[前提の不成立と再開条件](../task-260915031110-mastra-admin-mcp/impl.md)を解消してMCPタスクを完了後に再開する。
Gemma・AgentServer・テキスト変換の3タスクは完了しており、現行のDify会話経路は維持している。
