# 評価: task-260914172951-bridge-pose-settings

## 判定

PASS

## 根拠

- `SincroAppController.connectPoseSettings` が診断モデルの正規化済み設定をシーンへ接続し、通常設定の強度変更は診断モデルへ一度だけ入力し、診断側操作は同じ通知先へ渡す。初期設定はシーン生成時に同じ正本から取得する。
- 設定通知と通常設定購読の解除を有効アプリの `eventUnsubscribers` で所有し、コールバックの同一性比較により古い解除が新しい接続を消さない。循環する再入力はない。motion-debug は通知を使わず、独立ページで明示適用を維持する。
- `npm --prefix sincromisor-frontend run test -- src/app/controller/__tests__/sincroAppPoseSettings.test.ts src/features/debug/model/__tests__/debugConsoleSincroMotionControls.test.ts src/character/scene/__tests__/vrmDiagnostics.test.ts` は3ファイル・6テスト成功。公開責務と所有・解除条件は `documents/design/frontend/app-shell.md` と `documents/design/frontend/character/overview.md` に同期され、今回のMarkdown差分とTypeScriptコメントに規約違反はない。

## 残課題

- なし
