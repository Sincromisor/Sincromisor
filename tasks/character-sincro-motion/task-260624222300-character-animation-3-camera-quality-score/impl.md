# Implementation Log: task-260624222300-character-animation-3-camera-quality-score

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / review.md 申し送り対応

- `CameraQualityScore` は `trackingRuntime` の pure scorer として公開し、motion-debug は履歴、track settings、video 実サイズ、pose snapshot を渡すだけにした。Phase 4 の ReliabilityMap 接続を見越して、page 専用型には閉じ込めていない。
- guide message は reason code から固定文言へ変換するテーブルを `cameraQualityGuideMessages.ts` に分離し、テストで文言と優先順を固定した。同じ文言へ複数 reason が集約される場合は、優先順が高い code を維持しつつ severity は bad を優先する。
- component score と `overall.status` は task.md の閾値に固定した。unknown component は score 0 として平均へ含める。
- `borderRisk` は torso / hands の対象点を集約する独立 component にした。全対象点欠損は unknown、外側と `< 0.04` は bad、`< 0.08` は warn とし、torso / hand の reason は同時に保持する。
- `motionBlurRisk` は cadence、actual `frameRate`、低 pose confidence 継続だけを見る v1 proxy に限定し、pixel blur / brightness 解析は入れていない。
- raw `deviceId` / `groupId` / `label` は `CameraQualityScore` に保存しない。保存先は live snapshot が `camera.quality`、recording frame が `frame.metrics.cameraQuality`。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に CameraQualityScore v1、保存先、raw device identifier 非保存、固定 guide message、ReliabilityMap 未接続を同期した。

### ハマった点 / 回避

- scorer 初版が構造ルールの行数上限を超えたため、型、component evaluator、geometry helper、guide message builder に分割した。公開入口は `cameraQualityScore.ts` の `createCameraQualityScore()` のまま維持した。
- `MotionDebugCameraState` の既存 `frameTiming?: TrackerVideoFrameTiming` は維持し、`quality?: CameraQualityScore` だけを追加した。

### 検証

- `npm run test -- cameraQualityScore`
- `npm run test -- motionDebugViewerModel`
- `npm run test -- motionDebugRecorder`
- `npm run check`
- `npm run build`
- `npm run test -- cameraQualityScore motionDebugViewerModel motionDebugRecorder`
- `npm run gate`

### 未実行 / 残リスク

- 手動または Playwright での実カメラ `motion-debug` 確認は未実行。sandbox 実行では camera permission / 実デバイスの再現性がないため、unit test と build/gate で代替した。
- v1 の motion blur は仕様どおり proxy であり、実画像の blur / brightness は評価しない。
