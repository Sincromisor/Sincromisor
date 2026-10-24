# frontend タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 26 件）

### open（未完） — 3 件

| タスク                                                                                                           | タイトル                                        | 判定 | 依存 |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---- | ---- |
| [task-261024195953-simplify-home-secondary-labels](./task-261024195953-simplify-home-secondary-labels/task.md)   | トップページの冗長な補助ラベルを整理する        | —    | —    |
| [task-261024195953-simplify-looking-glass-guidance](./task-261024195953-simplify-looking-glass-guidance/task.md) | Looking Glass設定の状態表示と反映案内を整理する | —    | —    |
| [task-261024195953-simplify-startup-vrm-selection](./task-261024195953-simplify-startup-vrm-selection/task.md)   | 起動前のVRM選択を一つの操作領域にまとめる       | —    | —    |

### done（完了） — 23 件

| タスク                                                                                                             | タイトル                                                 | 判定    | 依存                                                 |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------- | ---------------------------------------------------- |
| [task-260913061234-home-concept-mock](./task-260913061234-home-concept-mock/task.md)                               | コンセプトを表現するトップページUIモックを作成           | ✅ PASS | —                                                    |
| [task-260913232939-promote-home-mock](./task-260913232939-promote-home-mock/task.md)                               | home-mockを基に正式トップページを置き換える              | ✅ PASS | —                                                    |
| [task-260914001047-remove-home-start-dialog](./task-260914001047-remove-home-start-dialog/task.md)                 | トップの開始案内と装飾番号を削除する                     | ✅ PASS | —                                                    |
| [task-260914002336-remove-home-explanatory-labels](./task-260914002336-remove-home-explanatory-labels/task.md)     | トップの自明な説明ラベルを整理する                       | ✅ PASS | —                                                    |
| [task-260914012033-complete-production-home](./task-260914012033-complete-production-home/task.md)                 | トップページの本番移行を完了する                         | ✅ PASS | —                                                    |
| [task-260914144148-rtc-event-lifecycle](./task-260914144148-rtc-event-lifecycle/task.md)                           | RTCイベントの通知順序と旧接続の購読解除を修正            | ✅ PASS | —                                                    |
| [task-260914232318-settings-gaze-consistency](./task-260914232318-settings-gaze-consistency/task.md)               | 視線設定と自動ミュートの整合性を修正する                 | ✅ PASS | —                                                    |
| [task-260914232323-persist-webui-settings](./task-260914232323-persist-webui-settings/task.md)                     | 通常設定をブラウザーに保存してURL優先で復元する          | ✅ PASS | `task-260914232318-settings-gaze-consistency`        |
| [task-260914232327-reset-webui-settings](./task-260914232327-reset-webui-settings/task.md)                         | WebUIの全設定を初期状態に戻す操作を追加する              | ✅ PASS | `task-260914232323-persist-webui-settings`           |
| [task-260914232333-persist-audio-tuning](./task-260914232333-persist-audio-tuning/task.md)                         | 音声デバッグ調整を保存して再読込後に復元する             | ✅ PASS | `task-260914232327-reset-webui-settings`             |
| [task-260914232333-persist-tracking-tuning](./task-260914232333-persist-tracking-tuning/task.md)                   | 視線と姿勢のデバッグ調整を保存して復元する               | ✅ PASS | `task-260914232327-reset-webui-settings`             |
| [task-260921175038-modernize-runtime-apis](./task-260921175038-modernize-runtime-apis/task.md)                     | 描画とUIの非推奨ライブラリAPIを更新                      | ✅ PASS | —                                                    |
| [task-260921175038-modernize-zod-numbers](./task-260921175038-modernize-zod-numbers/task.md)                       | Zodの非推奨な有限数検証を整理                            | ✅ PASS | —                                                    |
| [task-260921175038-modernize-zod-objects](./task-260921175038-modernize-zod-objects/task.md)                       | Zodの非推奨な未知キー保持APIを更新                       | ✅ PASS | —                                                    |
| [task-260921175828-modernize-vite-config](./task-260921175828-modernize-vite-config/task.md)                       | Viteの非推奨ビルド設定を更新                             | ✅ PASS | —                                                    |
| [task-261010185542-fix-settings-layout-and-controls](./task-261010185542-fix-settings-layout-and-controls/task.md) | 設定UIのタブ配置・スクロール・入力操作の不具合を修正する | ✅ PASS | —                                                    |
| [task-261010185549-refresh-settings-visual-design](./task-261010185549-refresh-settings-visual-design/task.md)     | 設定UIの装飾・説明・状態表示を統一する                   | ✅ PASS | `task-261010185549-reorganize-settings-and-startup`  |
| [task-261010185549-reorganize-settings-and-startup](./task-261010185549-reorganize-settings-and-startup/task.md)   | 設定項目を利用目的別に再編し起動前の導線を整理する       | ✅ PASS | `task-261010185542-fix-settings-layout-and-controls` |
| [task-261011151020-unify-frontend-development-tools](./task-261011151020-unify-frontend-development-tools/task.md) | フロントエンド開発ツールをnpm workspacesで一元管理する   | ✅ PASS | —                                                    |
| [task-261011152416-update-frontend-dependencies](./task-261011152416-update-frontend-dependencies/task.md)         | フロントエンドの実行時依存と開発依存を更新する           | ✅ PASS | `task-261011151020-unify-frontend-development-tools` |
| [task-261024195952-remove-redundant-panel-headings](./task-261024195952-remove-redundant-panel-headings/task.md)   | 設定と開発者ツールで選択中カテゴリの重複見出しを整理する | ✅ PASS | —                                                    |
| [task-261024195952-simplify-experience-guidance](./task-261024195952-simplify-experience-guidance/task.md)         | 体験選択の説明と再接続案内の重複を整理する               | ✅ PASS | —                                                    |
| [task-261024195952-simplify-settings-field-labels](./task-261024195952-simplify-settings-field-labels/task.md)     | 共通設定を項目名と入力で理解できる表示に整理する         | ✅ PASS | —                                                    |

<!-- AUTOGEN:tasks END -->
