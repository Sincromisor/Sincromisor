# frontend-maintenance タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 8 件）

### open（未完） — 2 件

| タスク                                                                                                           | タイトル                                     | 判定 | 依存                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [task-260906004358-collapse-app-forwarding-layers](./task-260906004358-collapse-app-forwarding-layers/task.md)   | アプリ制御の単純転送と依存組み立てを統合     | —    | `task-260906004357-remove-legacy-chat-rendering`, `task-260906004357-remove-legacy-telop-rendering`, `task-260906004358-simplify-react-settings-subscription` |
| [task-260906004358-release-app-event-subscriptions](./task-260906004358-release-app-event-subscriptions/task.md) | アプリ制御の差し替え時に旧イベント購読を解除 | —    | `task-260906004358-collapse-app-forwarding-layers`                                                                                                            |

### done（完了） — 6 件

| タスク                                                                                                                     | タイトル                                         | 判定    | 依存                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------- | ---------------------------------------------------- |
| [task-260906004357-remove-legacy-chat-rendering](./task-260906004357-remove-legacy-chat-rendering/task.md)                 | チャット描画をReactへ一本化して旧DOM処理を削除   | ✅ PASS | `task-260906004357-remove-unused-conversation-state` |
| [task-260906004357-remove-legacy-telop-rendering](./task-260906004357-remove-legacy-telop-rendering/task.md)               | テロップ描画をReactへ一本化して旧描画処理を削除  | ✅ PASS | `task-260906004357-remove-unused-conversation-state` |
| [task-260906004357-remove-unused-conversation-state](./task-260906004357-remove-unused-conversation-state/task.md)         | 会話処理の未使用蓄積と未使用取得APIを削除        | ✅ PASS | —                                                    |
| [task-260906004357-remove-unused-yaml-dependency](./task-260906004357-remove-unused-yaml-dependency/task.md)               | フロントエンドの未使用YAML依存とビルド設定を削除 | ✅ PASS | —                                                    |
| [task-260906004358-simplify-dialog-settings-access](./task-260906004358-simplify-dialog-settings-access/task.md)           | ダイアログ設定の読み書きと個別転送を整理         | ✅ PASS | —                                                    |
| [task-260906004358-simplify-react-settings-subscription](./task-260906004358-simplify-react-settings-subscription/task.md) | React設定購読の状態複製と初期同期を整理          | ✅ PASS | `task-260906004358-simplify-dialog-settings-access`  |

<!-- AUTOGEN:tasks END -->
