# backend タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 11 件）

### open（未完） — 2 件

| タスク                                                                                                             | タイトル                                    | 判定 | 依存 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---- | ---- |
| [task-261011152417-update-agent-server-dependencies](./task-261011152417-update-agent-server-dependencies/task.md) | AgentServerのMastra一式と実行環境を更新する | —    | —    |
| [task-261011152417-update-rtc-go-dependencies](./task-261011152417-update-rtc-go-dependencies/task.md)             | RTCのGo依存とGo保守版を更新する             | —    | —    |

### blocked（停止中） — 1 件

| タスク                                                                                                 | タイトル                                        | 判定 | 依存 |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---- | ---- |
| [task-261011152416-update-python-dependencies](./task-261011152416-update-python-dependencies/task.md) | Python依存を更新しMediaPipeの厳密固定を解除する | —    | —    |

### done（完了） — 8 件

| タスク                                                                                                     | タイトル                                              | 判定    | 依存                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| [task-260913042545-extractor-egl](./task-260913042545-extractor-egl/task.md)                               | 音声区間抽出コンテナの共有ライブラリ不足を修正        | ✅ PASS | —                                                                                    |
| [task-260915031110-mastra-admin-mcp](./task-260915031110-mastra-admin-mcp/task.md)                         | ローカル管理者のMCP接続をMastraから利用する           | ✅ PASS | `task-260915031110-mastra-studio-session-memory`                                     |
| [task-260915031110-mastra-studio-session-memory](./task-260915031110-mastra-studio-session-memory/task.md) | Mastra APIとStudio Editorを同梱し会話文脈を隔離する   | ✅ PASS | `task-260915031109-gemma4-llama-server`                                              |
| [task-260915031111-mastra-text-stream-adapter](./task-260915031111-mastra-text-stream-adapter/task.md)     | Mastraの応答を既存のテキスト処理契約へ変換する        | ✅ PASS | `task-260915031110-mastra-studio-session-memory`                                     |
| [task-260915031111-replace-dify-with-mastra](./task-260915031111-replace-dify-with-mastra/task.md)         | チャット生成をMastraへ切り替えDify依存を撤去する      | ✅ PASS | `task-260915031110-mastra-admin-mcp`, `task-260915031111-mastra-text-stream-adapter` |
| [task-260921171254-agent-server-recovery](./task-260921171254-agent-server-recovery/task.md)               | AgentServerの再起動・Consul登録・未対応feedbackの修正 | ✅ PASS | —                                                                                    |
| [task-260921173921-extract-agent-definition](./task-260921173921-extract-agent-definition/task.md)         | エージェント定義と初期プロンプトを分離する            | ✅ PASS | —                                                                                    |
| [task-260921175038-modernize-mastra-storage](./task-260921175038-modernize-mastra-storage/task.md)         | 非推奨APIの調査とMastra保存領域型の更新               | ✅ PASS | —                                                                                    |

<!-- AUTOGEN:tasks END -->
