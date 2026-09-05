# 顔追跡の推論時刻不整合を修正

## 背景 / 目的

Face ROI が有効なフレームでは、同じ `FaceLandmarker` に同一の `mediaTimeMs` を渡して全画面推論と ROI 推論を連続実行する。MediaPipe は動画推論の時刻に厳密な単調増加を要求するため、`Packet timestamp mismatch` が発生して顔同期追跡全体が停止する。

利用者が報告した再現済み不具合を根拠に、同一 `FaceLandmarker` へ渡す内部推論時刻だけを単調増加させ、記録、コールバック、推論間隔判定で使う `mediaTimeMs` は変更しない。

## 完了条件（受け入れ条件）

- [x] 同一フレームの全画面、ROI、全画面代替推論が同じ `FaceLandmarker` で連続しても、`detectForVideo()` へ渡す時刻が厳密に増加する。
- [x] カメラ再開などで映像時刻が巻き戻っても、既存の `FaceLandmarker` へ渡す時刻が巻き戻らない。
- [x] 顔スナップショットとトラッカーの時刻は元の `mediaTimeMs` を維持する。

## 設計判断

時刻の補正は `SincroFaceTracker` と MediaPipe の境界に集約する。呼び出し元ごとの補正や追加のモデルインスタンスは導入しない。

## スコープ境界

顔追跡の推論時刻、回帰試験、該当する現在設計の説明だけを変更する。Face ROI の構成、推論頻度、公開スナップショット契約は変更しない。

## 実装方針

- `SincroFaceTracker` の全 `detectForVideo()` 呼び出しを共通処理へ通し、直前値以下の時刻を次のミリ秒へ補正する。
- 停止後も同じモデルを再利用するため補正状態を保持し、モデルを破棄した場合だけ初期化する。
- 厳密な単調増加を検査する偽 `FaceLandmarker` で、同一フレームの ROI 代替処理と停止後の時刻巻き戻りを確認する。

## テスト

- `cd sincromisor-frontend && npm run test -- --run src/features/gaze/faceTracking/__tests__/sincroFaceMotionSnapshot.test.ts src/features/gaze/trackingRuntime/__tests__/trackerRuntime.test.ts`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`

## ドキュメント同期の要否

`documents/design/frontend/character/motion.md` の時刻説明を、記録と間隔判定の正本時刻、および MediaPipe 境界の単調増加補正を区別する内容へ更新する。公開APIと通信契約への影響はない。

## 完了後の記録補完

利用者から指摘された記録3件の欠落を修正した。元の実装コミット `a85f2ee6` とGit履歴を根拠に、[実装記録](impl.md)、[レビュー記録](review.md)、[評価記録](eval.md)を追加した。独立レビュー・評価の実施は確認できないため、実施済みとする記録は追加していない。

`npm run tasks:check`、`npm run tasks:index:check`、変更文書の整形確認は成功。本番コードと元の完了判定は変更していない。
