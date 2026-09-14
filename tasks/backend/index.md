# backend タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 5 件）

### blocked（停止中） — 2 件

| タスク                                                                                             | タイトル                                         | 判定 | 依存                                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---- | ------------------------------------------------------------------------------------ |
| [task-260915031110-mastra-admin-mcp](./task-260915031110-mastra-admin-mcp/task.md)                 | ローカル管理者のMCP接続をMastraから利用する      | —    | `task-260915031110-mastra-studio-session-memory`                                     |
| [task-260915031111-replace-dify-with-mastra](./task-260915031111-replace-dify-with-mastra/task.md) | チャット生成をMastraへ切り替えDify依存を撤去する | —    | `task-260915031110-mastra-admin-mcp`, `task-260915031111-mastra-text-stream-adapter` |

### done（完了） — 3 件

| タスク                                                                                                     | タイトル                                            | 判定    | 依存                                             |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------- | ------------------------------------------------ |
| [task-260913042545-extractor-egl](./task-260913042545-extractor-egl/task.md)                               | 音声区間抽出コンテナの共有ライブラリ不足を修正      | ✅ PASS | —                                                |
| [task-260915031110-mastra-studio-session-memory](./task-260915031110-mastra-studio-session-memory/task.md) | Mastra APIとStudio Editorを同梱し会話文脈を隔離する | ✅ PASS | `task-260915031109-gemma4-llama-server`          |
| [task-260915031111-mastra-text-stream-adapter](./task-260915031111-mastra-text-stream-adapter/task.md)     | Mastraの応答を既存のテキスト処理契約へ変換する      | ✅ PASS | `task-260915031110-mastra-studio-session-memory` |

<!-- AUTOGEN:tasks END -->
