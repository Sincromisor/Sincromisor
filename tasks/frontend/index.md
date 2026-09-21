# frontend タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 14 件）

### open（未完） — 3 件

| タスク                                                                                         | タイトル                            | 判定 | 依存 |
| ---------------------------------------------------------------------------------------------- | ----------------------------------- | ---- | ---- |
| [task-260921175038-modernize-runtime-apis](./task-260921175038-modernize-runtime-apis/task.md) | 描画とUIの非推奨ライブラリAPIを更新 | —    | —    |
| [task-260921175038-modernize-zod-numbers](./task-260921175038-modernize-zod-numbers/task.md)   | Zodの非推奨な有限数検証を整理       | —    | —    |
| [task-260921175038-modernize-zod-objects](./task-260921175038-modernize-zod-objects/task.md)   | Zodの非推奨な未知キー保持APIを更新  | —    | —    |

### done（完了） — 11 件

| タスク                                                                                                         | タイトル                                        | 判定    | 依存                                          |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------- | --------------------------------------------- |
| [task-260913061234-home-concept-mock](./task-260913061234-home-concept-mock/task.md)                           | コンセプトを表現するトップページUIモックを作成  | ✅ PASS | —                                             |
| [task-260913232939-promote-home-mock](./task-260913232939-promote-home-mock/task.md)                           | home-mockを基に正式トップページを置き換える     | ✅ PASS | —                                             |
| [task-260914001047-remove-home-start-dialog](./task-260914001047-remove-home-start-dialog/task.md)             | トップの開始案内と装飾番号を削除する            | ✅ PASS | —                                             |
| [task-260914002336-remove-home-explanatory-labels](./task-260914002336-remove-home-explanatory-labels/task.md) | トップの自明な説明ラベルを整理する              | ✅ PASS | —                                             |
| [task-260914012033-complete-production-home](./task-260914012033-complete-production-home/task.md)             | トップページの本番移行を完了する                | ✅ PASS | —                                             |
| [task-260914144148-rtc-event-lifecycle](./task-260914144148-rtc-event-lifecycle/task.md)                       | RTCイベントの通知順序と旧接続の購読解除を修正   | ✅ PASS | —                                             |
| [task-260914232318-settings-gaze-consistency](./task-260914232318-settings-gaze-consistency/task.md)           | 視線設定と自動ミュートの整合性を修正する        | ✅ PASS | —                                             |
| [task-260914232323-persist-webui-settings](./task-260914232323-persist-webui-settings/task.md)                 | 通常設定をブラウザーに保存してURL優先で復元する | ✅ PASS | `task-260914232318-settings-gaze-consistency` |
| [task-260914232327-reset-webui-settings](./task-260914232327-reset-webui-settings/task.md)                     | WebUIの全設定を初期状態に戻す操作を追加する     | ✅ PASS | `task-260914232323-persist-webui-settings`    |
| [task-260914232333-persist-audio-tuning](./task-260914232333-persist-audio-tuning/task.md)                     | 音声デバッグ調整を保存して再読込後に復元する    | ✅ PASS | `task-260914232327-reset-webui-settings`      |
| [task-260914232333-persist-tracking-tuning](./task-260914232333-persist-tracking-tuning/task.md)               | 視線と姿勢のデバッグ調整を保存して復元する      | ✅ PASS | `task-260914232327-reset-webui-settings`      |

<!-- AUTOGEN:tasks END -->
