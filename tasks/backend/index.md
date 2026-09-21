# backend タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 6 件）

### done（完了） — 6 件

| タスク                                                                                                     | タイトル                                              | 判定    | 依存                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| [task-260913042545-extractor-egl](./task-260913042545-extractor-egl/task.md)                               | 音声区間抽出コンテナの共有ライブラリ不足を修正        | ✅ PASS | —                                                                                    |
| [task-260915031110-mastra-admin-mcp](./task-260915031110-mastra-admin-mcp/task.md)                         | ローカル管理者のMCP接続をMastraから利用する           | ✅ PASS | `task-260915031110-mastra-studio-session-memory`                                     |
| [task-260915031110-mastra-studio-session-memory](./task-260915031110-mastra-studio-session-memory/task.md) | Mastra APIとStudio Editorを同梱し会話文脈を隔離する   | ✅ PASS | `task-260915031109-gemma4-llama-server`                                              |
| [task-260915031111-mastra-text-stream-adapter](./task-260915031111-mastra-text-stream-adapter/task.md)     | Mastraの応答を既存のテキスト処理契約へ変換する        | ✅ PASS | `task-260915031110-mastra-studio-session-memory`                                     |
| [task-260915031111-replace-dify-with-mastra](./task-260915031111-replace-dify-with-mastra/task.md)         | チャット生成をMastraへ切り替えDify依存を撤去する      | ✅ PASS | `task-260915031110-mastra-admin-mcp`, `task-260915031111-mastra-text-stream-adapter` |
| [task-260921171254-agent-server-recovery](./task-260921171254-agent-server-recovery/task.md)               | AgentServerの再起動・Consul登録・未対応feedbackの修正 | ✅ PASS | —                                                                                    |

<!-- AUTOGEN:tasks END -->
