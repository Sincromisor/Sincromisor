# 姿勢調整の状態と通知を診断モデルから独立

## 背景 / 目的

AppController.pose は DebugConsoleManager の診断スナップショットを正本として取得し、DebugConsoleSincroMotionControls が正規化とシーン向け通知を持つ。診断表示のモデルが本番姿勢設定を所有する関係を解消する。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 中。作業区分: 高リスク変更（姿勢設定の正本とシーン購読・保存経路を変更）。

先行: [通常設定の状態と適用規則をダイアログから独立](../task-260915005054-extract-app-settings-model/task.md)。先行タスクが移したファイルは移動先を参照する。

## 完了条件（受け入れ条件）

- [ ] 姿勢調整の現在値・正規化・変更通知は character/runtime の姿勢設定モデルが所有し、app が通常設定・保存値・診断操作を接続する。診断スナップショットは表示用の複製になる。
- [ ] 診断Consoleを描画しなくても、通常設定の強度と復元済み姿勢調整がシーンへ適用される。motion-debug の明示調整も同じ正規化を利用する。
- [ ] 通常強度に診断保存値を重ねる復元順、同値の通常強度操作による診断上書き解除、同期時の非保存、利用者が指定した項目だけの保存を維持する。
- [ ] シーン接続時の現在値通知、アプリ差し替え時の旧購読解除、古い解除による新購読の保護を維持し、別ページの実行時状態を共有しない。

## 設計判断

本番の設定モデルはアプリの組み立てが所有し、motion-debug は独立のモデルを所有する。モデルはUI・保存APIを読まず、診断操作の保存はアプリ側の編集通知接続で行う。既存 SincroPoseRetargetConfig と正規化処理を再利用する。音声・視線調整や診断結果の全体再編は行わない。

## スコープ境界

姿勢設定モデル、DebugConsoleSincroMotionControls / Runtime、AppController.pose の橋渡し、設定復元・初期化・診断操作、motion-debug の明示調整を対象にする。ソルバー・姿勢合成のアルゴリズムは変更しない。

## 実装の参照先

- [sincroAppControllerRuntime.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppControllerRuntime.ts)
- [sincroAppController.ts](../../../sincromisor-frontend/src/app/controller/sincroAppController.ts)
- [debugConsoleSincroMotionControls.ts](../../../sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionControls.ts)
- [debugConsoleSincroMotionRuntime.ts](../../../sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionRuntime.ts)
- [sincroAppSettingsPersistence.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsPersistence.ts)
- [sincroAppSettingsReset.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsReset.ts)
- [motionDebugSceneRuntime.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugSceneRuntime.ts)

## 確認方法

sincroAppPoseSettings / sincroAppSettingsPersistence / sincroAppSettingsReset と該当する診断モデルの既存テストを更新する。診断表示なしの復元→シーン接続、通常強度の同値操作、旧解除を実際のモデルとアプリ窓口で確認する。開発環境で通常設定と診断調整が描画へ反映されることを一度確認する。高リスク変更の独立評価と全体確認はタスク管理の作業経路に従う。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

診断モデルが本番姿勢設定を所有する現行契約を変更し、新しい所有者と接続順を同期する。保存キー・版と診断表示項目は維持する。

- [app-shell.md](../../../documents/design/frontend/app-shell.md)
- [debug-design.md](../../../documents/design/frontend/setting-and-debug-ui/debug-design.md)
- [settings-design.md](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)
