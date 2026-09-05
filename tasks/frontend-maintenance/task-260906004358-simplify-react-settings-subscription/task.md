# React設定購読の状態複製と初期同期を整理

## 背景 / 目的

`useSincroAppControllerSettingsState` は設定値・操作可否・案内を別々の `useState` とイベントで複製し、初期値取得と購読時の同期処理も持っている。変更のない状態まで再構築され、設定側とReact側の同期を読む範囲が広い。

根拠はフロントエンドの肥大化レビューに対する改善タスク起票のユーザー要求である。起票時の確認基点は `75ebbdb4d562dfefbd5cbd887e121a8a0b9cc3bb`。実装着手時に現在のコードと呼び出し元を再確認する。

## 完了条件

- [x] 設定値・操作可否・案内の参照を一つの設定スナップショット購読へまとめ、React側の重複保持と専用の初期同期処理を削減する。
- [x] `useSyncExternalStore` を使う場合は変更がない間の取得結果の参照を安定させ、購読解除と初期表示を保証する。既存の `DebugConsole` の実装を参考にする。
- [x] 起動前ダイアログと起動後設定の表示が一致し、設定適用後に同一更新の値と操作可否が表示される。
- [x] 他の利用者を調べ、不要になった旧同期処理だけを削除する。キャッシュは利用経路が消えた範囲で整理し、単なる別名の中継層を追加しない。

## 変更範囲と方針

対象は設定値・操作可否・案内の読み取り経路に限定する。接続状態、起動状態、VRM選択、メディア取得、Looking Glass反映の状態機械は変更しない。既存の起動状態やページ固有のイベント処理は維持する。新しい状態管理依存は追加しない。

- [useSincroAppControllerSettingsState.ts](../../../sincromisor-frontend/src/app/react/useSincroAppControllerSettingsState.ts)
- [sincroAppStateSnapshotHydrators.ts](../../../sincromisor-frontend/src/app/react/sincroAppStateSnapshotHydrators.ts)
- [sincroAppSettingsRelatedPayloadCache.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsRelatedPayloadCache.ts)
- [sincroAppSettingsRelatedSnapshotBuilder.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsRelatedSnapshotBuilder.ts)
- [sincroAppEmitHelpers.ts](../../../sincromisor-frontend/src/app/events/sincroAppEmitHelpers.ts)
- [useConfigurationDialogSettingsState.ts](../../../sincromisor-frontend/src/features/dialog/react/useConfigurationDialogSettingsState.ts)
- [settings](../../../sincromisor-frontend/src/features/settings)

## 依存タスク

- [ダイアログ設定の読み書きと個別転送を整理](../task-260906004358-simplify-dialog-settings-access/task.md)

## 確認方法

- 初期表示、設定更新、変更のない取得結果、購読解除を対象に一つの小さな購読テストを追加または更新する。
- 開発環境で起動前と起動後の設定値・操作可否を一度確認する。ハードウェア依存の機能実行は必須にしない。
- `sincromisor-frontend` で `npm run build` を実行する。変更したソースの整形・静的検査は対象ファイルに限定する。
- 実行コマンド、確認結果、未実行項目と理由を本書に追記する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定・診断画面](../../../documents/design/frontend/settings-and-debug-ui.md)の該当記述を実装に合わせ、[設計索引](../../../documents/design/index.md)の導線を確認する。通信形式、公開URL、保存形式の変更は含めない。

## 実施結果

通常変更として実施。`SincroAppSettingsStore` の安定したスナップショットを `useSyncExternalStore` で購読し、React側の設定値・操作可否・案内の個別保持と初期同期を削除した。通知中だけ使うキャッシュと未使用になった操作可否・案内のイベント、個別取得も削除した。VRMシーンが使う `settings_snapshot` と起動・接続・ページ固有の通知は維持した。

既存の更新ループは `useSimpleVrmPanelEventState` が描画ごとに作る解除時コールバックを設定フックの依存に含め、再購読時の初期通知で再描画することが原因だった。設定フック内の `useEffectEvent` で最新のコールバックを参照し、関数の作り直しによる再購読をなくした。

- `cd sincromisor-frontend && npm run test -- src/app/settings src/features/dialog/model/__tests__/dialogSettingsAccess.test.ts src/features/conversation src/pages/simpleVrm/react/__tests__`: 7ファイル・15件成功。初期値、同値取得・同値更新の参照安定、一括公開、購読解除、既存の設定適用、ページ固有の状態処理を確認。
- `npm run build`: 成功。既存の大きな出力ファイルに関する警告あり。
- 変更ソースの `biome check`、変更文書のPrettier整形、差分・コメント点検を実施。
- 開発サーバーの `/simple-vrm/` で `playwright-cli -s=maintenance run-code --filename=tasks/frontend-maintenance/task-260906004358-simplify-react-settings-subscription/acceptance/browser.js` を実行。起動前後の題名と操作可否の一致、起動後の変更がダイアログへ戻っても表示されること、取得結果の参照安定を確認。Reactの更新ループ・取得キャッシュ・フックに関するエラーは0件。
- バックエンド未接続の404、実機入力を取得できないエラー、WebGLの性能警告は画面確認の対象外。実機入力・バックエンド通信・Looking Glass実機反映は未実行。
- 共通枠組みと設定・診断画面の設計を同期し、設計索引の既存導線を確認。文書点検・コメント点検はPASS。
- `tasks:index:check` は成功。`tasks:check` は既存の `task-260904005741-fix-face-landmarker-timestamp` の `review.md` / `impl.md` / `eval.md` 欠落で失敗し、今回の変更範囲外。
