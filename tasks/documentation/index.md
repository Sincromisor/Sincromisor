# documentation タスク一覧

日本語推敲は、`documents/rules`と`documents/design`の現在有効な46文書を対象に、yomiyasuを使う33件のタスクに分けた。採用済みの設計判断、継続中の取り組み計画、現行テンプレートと文書運用ガイドも含む。`archive/`と旧`template.md`、対象ディレクトリ外の文書は除く。各タスクは最大約2万文字を担当し、同じ文書の分割タスクは依存順に実行する。

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 35 件）

### open（未完） — 17 件

| タスク                                                                                                           | タイトル                                                            | 判定 | 依存                                     |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---- | ---------------------------------------- |
| [task-261001222204-yomiyasu-37-tracking](./task-261001222204-yomiyasu-37-tracking/task.md)                       | 文書の日本語表現を整える（フロントエンドのキャラクター追跡・第1部） | —    | —                                        |
| [task-261001222204-yomiyasu-38-tracking](./task-261001222204-yomiyasu-38-tracking/task.md)                       | 文書の日本語表現を整える（フロントエンドのキャラクター追跡・第2部） | —    | `task-261001222204-yomiyasu-37-tracking` |
| [task-261001222205-yomiyasu-39-tracking](./task-261001222205-yomiyasu-39-tracking/task.md)                       | 文書の日本語表現を整える（フロントエンドのキャラクター追跡・第3部） | —    | `task-261001222204-yomiyasu-38-tracking` |
| [task-261001222205-yomiyasu-40-pages](./task-261001222205-yomiyasu-40-pages/task.md)                             | 文書の日本語表現を整える（フロントエンドのページ構成）              | —    | —                                        |
| [task-261001222205-yomiyasu-41-readme](./task-261001222205-yomiyasu-41-readme/task.md)                           | 文書の日本語表現を整える（設定・診断画面の案内ほか）                | —    | —                                        |
| [task-261001222205-yomiyasu-42-debug-items](./task-261001222205-yomiyasu-42-debug-items/task.md)                 | 文書の日本語表現を整える（デバッグUIの項目一覧）                    | —    | —                                        |
| [task-261001222206-yomiyasu-43-settings-design](./task-261001222206-yomiyasu-43-settings-design/task.md)         | 文書の日本語表現を整える（設定UIの設計）                            | —    | —                                        |
| [task-261001222206-yomiyasu-44-settings-items](./task-261001222206-yomiyasu-44-settings-items/task.md)           | 文書の日本語表現を整える（設定UIの項目一覧）                        | —    | —                                        |
| [task-261001222206-yomiyasu-45-index](./task-261001222206-yomiyasu-45-index/task.md)                             | 文書の日本語表現を整える（設計ドキュメント）                        | —    | —                                        |
| [task-261001222206-yomiyasu-46-compose](./task-261001222206-yomiyasu-46-compose/task.md)                         | 文書の日本語表現を整える（インフラ: Docker Composeほか）            | —    | —                                        |
| [task-261001222206-yomiyasu-47-logging](./task-261001222206-yomiyasu-47-logging/task.md)                         | 文書の日本語表現を整える（インフラ: ログの保存と検索）              | —    | —                                        |
| [task-261001222207-yomiyasu-48-storage](./task-261001222207-yomiyasu-48-storage/task.md)                         | 文書の日本語表現を整える（インフラ: 保存領域）                      | —    | —                                        |
| [task-261001222207-yomiyasu-49-proper-noun-biasing](./task-261001222207-yomiyasu-49-proper-noun-biasing/task.md) | 文書の日本語表現を整える（固有名詞認識の補強計画ほか）              | —    | —                                        |
| [task-261001222207-yomiyasu-51-contract-spec](./task-261001222207-yomiyasu-51-contract-spec/task.md)             | 文書の日本語表現を整える（<契約名>ほか）                            | —    | —                                        |
| [task-261001222215-yomiyasu-89-code-structure](./task-261001222215-yomiyasu-89-code-structure/task.md)           | 文書の日本語表現を整える（コード構造ルールほか）                    | —    | —                                        |
| [task-261001222215-yomiyasu-90-coding-md](./task-261001222215-yomiyasu-90-coding-md/task.md)                     | 文書の日本語表現を整える（コーディング規約(Markdown)ほか）          | —    | —                                        |
| [task-261001222215-yomiyasu-91-coding-ts](./task-261001222215-yomiyasu-91-coding-ts/task.md)                     | 文書の日本語表現を整える（コーディング規約(TypeScript)ほか）        | —    | —                                        |

### done（完了） — 18 件

| タスク                                                                                                                         | タイトル                                                            | 判定    | 依存                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------- | -------------------------------------- |
| [task-260905105729-japanese-document-readability](./task-260905105729-japanese-document-readability/task.md)                   | 実装エージェントの参照文書に残る不要な英語表記を日本語へ修正        | ✅ PASS | —                                      |
| [task-261001221346-readme-japanese](./task-261001221346-readme-japanese/task.md)                                               | READMEの日本語を自然な表現に整える                                  | ✅ PASS | —                                      |
| [task-261001222158-yomiyasu-02-overview](./task-261001222158-yomiyasu-02-overview/task.md)                                     | 文書の日本語表現を整える（Sincromisor 全体構成ほか）                | ✅ PASS | —                                      |
| [task-261001222201-yomiyasu-22-agent-server](./task-261001222201-yomiyasu-22-agent-server/task.md)                             | 文書の日本語表現を整える（バックエンド: AgentServerほか）           | ✅ PASS | —                                      |
| [task-261001222202-yomiyasu-23-text-processor](./task-261001222202-yomiyasu-23-text-processor/task.md)                         | 文書の日本語表現を整える（バックエンドサービス: TextProcessorほか） | ✅ PASS | —                                      |
| [task-261001222202-yomiyasu-24-audio-pipeline-websocket](./task-261001222202-yomiyasu-24-audio-pipeline-websocket/task.md)     | 文書の日本語表現を整える（音声パイプラインのWebSocket契約）         | ✅ PASS | —                                      |
| [task-261001222202-yomiyasu-25-frontend-rtc](./task-261001222202-yomiyasu-25-frontend-rtc/task.md)                             | 文書の日本語表現を整える（フロントエンドのRTC契約ほか）             | ✅ PASS | —                                      |
| [task-261001222202-yomiyasu-26-adr-260222-react-migration](./task-261001222202-yomiyasu-26-adr-260222-react-migration/task.md) | 文書の日本語表現を整える（ADR-260222 React移行ほか）                | ✅ PASS | —                                      |
| [task-261001222202-yomiyasu-27-adr-260726-pion-codec-poc](./task-261001222202-yomiyasu-27-adr-260726-pion-codec-poc/task.md)   | 文書の日本語表現を整える（ADR-260726 Pion コーデック PoC）          | ✅ PASS | —                                      |
| [task-261001222203-yomiyasu-28-documentation-guide](./task-261001222203-yomiyasu-28-documentation-guide/task.md)               | 文書の日本語表現を整える（設計ドキュメント運用ガイド）              | ✅ PASS | —                                      |
| [task-261001222203-yomiyasu-29-app-shell](./task-261001222203-yomiyasu-29-app-shell/task.md)                                   | 文書の日本語表現を整える（フロントエンドの共通枠組み）              | ✅ PASS | —                                      |
| [task-261001222203-yomiyasu-30-vad](./task-261001222203-yomiyasu-30-vad/task.md)                                               | 文書の日本語表現を整える（フロントエンド VAD）                      | ✅ PASS | —                                      |
| [task-261001222203-yomiyasu-31-motion](./task-261001222203-yomiyasu-31-motion/task.md)                                         | 文書の日本語表現を整える（フロントエンドのキャラクター動作・第1部） | ✅ PASS | —                                      |
| [task-261001222203-yomiyasu-32-motion](./task-261001222203-yomiyasu-32-motion/task.md)                                         | 文書の日本語表現を整える（フロントエンドのキャラクター動作・第2部） | ✅ PASS | `task-261001222203-yomiyasu-31-motion` |
| [task-261001222204-yomiyasu-33-motion](./task-261001222204-yomiyasu-33-motion/task.md)                                         | 文書の日本語表現を整える（フロントエンドのキャラクター動作・第3部） | ✅ PASS | `task-261001222203-yomiyasu-32-motion` |
| [task-261001222204-yomiyasu-34-motion](./task-261001222204-yomiyasu-34-motion/task.md)                                         | 文書の日本語表現を整える（フロントエンドのキャラクター動作・第4部） | ✅ PASS | `task-261001222204-yomiyasu-33-motion` |
| [task-261001222204-yomiyasu-36-overview](./task-261001222204-yomiyasu-36-overview/task.md)                                     | 文書の日本語表現を整える（フロントエンドのキャラクター概要）        | ✅ PASS | —                                      |
| [task-261001222210-yomiyasu-35-motion](./task-261001222210-yomiyasu-35-motion/task.md)                                         | 文書の日本語表現を整える（フロントエンドのキャラクター動作・第5部） | ✅ PASS | `task-261001222204-yomiyasu-34-motion` |

<!-- AUTOGEN:tasks END -->
