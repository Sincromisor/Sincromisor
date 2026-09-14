# 評価: task-260915005054-centralize-calibration-lifecycle

## 判定

PASS

## 根拠

- `SincroAppCalibration` をアプリごとに所有し、受理済みの `sincro` 開始だけで session を作る。ダイアログ、設定パネル、OBS の開始は `SincroAppController.start()` に集約され、chat・重複開始・解除済みアプリでは新しい較正を開始しない。
- 接続停止、カメラ変更（`undefined` の既定カメラ復帰を含む）、視線・Pose追跡停止、sincro モード離脱、利用者によるVRM選択、アプリ解除を当該アプリの有効 session の中断へ接続している。初期キャッシュ復元は選択通知を発生させず、音声・RTCだけの失敗は較正を中断しない。
- 視線制御の取得・初期化・フレーム・終了通知は追跡世代を検査し、較正 controller の session 検査と合わせて旧アプリ、旧開始結果、旧フレームが再開始後または新アプリの較正を変更しない。Pose観測時刻を使う既存の継続時間計測と段階別再試行も維持している。
- パネルは較正状態の購読と再試行要求だけを行い、`vrmStatusText` 比較を削除した。公開挙動の設計文書3件はアプリ所有、開始入口、取消条件、世代保護を同期し、今回変更した Markdown は整形済みである。
- 本番の所有者・世代・中断範囲を説明するコメントは変更したシンボルと処理群に整合している。更新後のRTCテストはネットワーク境界だけを代替し、実際の `SincroRtcSessionController` のhealth失敗通知後も較正を維持することを確認している。
- 独立確認: `npm test -- src/app/controller/__tests__/sincroAppCalibration.test.ts src/app/bootstrap/__tests__/vrmInitialization.test.ts src/app/controller/__tests__/sincroAppController.test.ts src/app/controller/__tests__/sincroAppPoseSettings.test.ts src/app/settings/react/__tests__/initialCalibrationProductionBridge.test.tsx src/app/settings/react/__tests__/panelCameraGuideState.test.tsx src/character/runtime/__tests__/sincroMotionComputation.test.ts` は7ファイル19テストすべてPASS。`npx prettier --check` による今回変更したMarkdown4件もPASS。実装記録のビルドPASS、全638テストPASS（2スキップ）、構造検査 failures=0 と整合する。全体ゲートの既存Markdown15件の整形不一致は今回の差分によるものではない。

## 残課題

- なし
