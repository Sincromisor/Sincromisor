# character animation 3.0 phase 8 pose seeded face ROI tracking

## 背景 / 目的

Phase 8 では、Pose face region を起点に FaceLandmarker ROI を作り、head orientation の主入力である Face transformation matrix を安定させる。roadmap は head orientation を Face transformation matrix 主入力、Pose nose / ears / eyes fallback とし、Face / Hand / ROI 専用 reliability は Phase 8 以降の責務としている（`documents/research/character_animation/roadmap.md:240`、`documents/design/frontend/character/tracking.md:139`）。

このタスクでは、既存 `SincroFaceTracker` を全画面専用から ROI 入力に対応させ、Pose-seeded face ROI と full-frame fallback の結果を同じ `SincroFaceMotionSnapshot` に保存できるようにする。Face retarget や head temporal の本格接続は既存経路を維持し、ROI 由来か full-frame 由来かを debug / reliability で判断できる情報を追加する。

## 完了条件（受け入れ条件）

- [ ] `SincroFaceMotionSnapshot` に optional `roi` field を追加する。`roi` は依存タスクの `SincroRoiObservation` に限定し、canvas / ImageBitmap / MediaPipe raw result は含めない。
- [ ] `SincroFaceMotionSnapshot` に optional `source = "roi" | "full-frame" | "full-frame-fallback" | "lost"` と `warnings: string[]` を追加する。既存 field の `trackingEnabled`、`detected`、`confidence`、`headPose`、`blendshapes`、`inferenceTimeMs`、`inferenceFps`、`lastUpdatedAtMs`、`fallbackReason` は維持する。
- [ ] `SincroFaceTracker.detect()` は既存 signature を維持し、全画面推論として動作する。新規 `detectWithRoi(videoFrame, poseSnapshot, timestampMs, options)` を追加し、Pose face ROI が valid なら crop 推論、invalid なら full-frame fallback を実行する。
- [ ] `detectWithRoi()` の `options` は v1 では optional empty object に固定する。新しい設定 field は追加しない。
- [ ] ROI crop の landmark / transformation matrix は FaceLandmarker の crop-local result として扱い、snapshot の `headPose.matrix` は従来どおり matrix number array を保持する。crop-local face landmark 全点は snapshot に保存しない。
- [ ] ROI 推論で `faceLandmarks.length === 0` の場合、同一 frame で full-frame fallback を 1 回だけ実行する。fallback でも未検出なら `detected = false`、`source = "lost"`、`fallbackReason = "face_not_detected"`、warning `roi_missing` または `roi_inconsistent` を残す。
- [ ] ROI result が valid な場合でも、Pose face ROI center と Face result の推定 center の consistency score が 0 の場合は `source = "full-frame-fallback"` へ切り替える。full-frame fallback を使わない場合は `detected = false` としない。
- [ ] `TrackerRuntime` / Worker 経路では、Pose がある frame だけ Face ROI を試す。Pose が未実行の frame または pose-only fallback 中は既存 full-frame Face tracking を使い、Face が Pose cadence に引きずられて止まらない。
- [ ] `SincroFaceTracker.getSnapshot()` と `stop()` は新規 `roi` / `source` / `warnings` field を deep clone / default 初期化する。
- [ ] `sincromisor-frontend/src/features/gaze/faceTracking/__tests__/sincroFaceMotionSnapshot.test.ts` または tracker helper test で、既存 full-frame snapshot 互換、valid ROI、invalid ROI fallback、ROI no-face fallback、stop snapshot default を検証する。
- [ ] Face ROI test には、valid ROI だが consistency score 0 の場合に full-frame fallback へ切り替わることを含める。

## 設計判断（着手前に確定済み）

- `SincroFaceMotionSnapshot` を拡張し、新しい Face ROI 専用 snapshot は作らない。既存 retarget / behavior は `SincroFaceMotionSnapshot` を読んでおり、source/roi を optional 追加する方が後方互換を保ちやすいためである。
- 既存 `detect()` は full-frame のまま維持する。Face ROI を標準にする案は、Pose が未実行の frame でも face tracking を続ける現行 behavior と衝突するため採用しない。
- ROI failure 時の fallback は full-frame Face pass 1 回に固定する。ROI retry や複数 face search は負荷と状態分岐が増えるため Phase 8 v1 では扱わない。
- Face ROI は head orientation / face reliability の品質改善に限定し、mouth / blink retarget の既存係数や calibration は本タスクで変更しない。
- Face landmarks 全点は保存しない。Phase 1 log schema は raw MediaPipe serializer を未実装扱いにしており、Face ROI v1 で raw landmarks を先取りすると replay schema が膨らむため採用しない。

## スコープ境界

- 本タスクでやること:
    - `SincroFaceMotionSnapshot` の ROI metadata 拡張。
    - `SincroFaceTracker.detectWithRoi()` と full-frame fallback。
    - Worker / TrackerRuntime で Pose がある frame の Face ROI 実行。
    - Face ROI helper / snapshot の unit test。
- 本タスクでやらないこと:
    - Face retarget の係数変更。
    - head temporal estimator への Face reliability 接続。
    - Face raw landmarks の replay 保存。
    - UI calibration wizard。
    - 複数人 face selection。
- 依存タスクとの境界:
    - ROI contract task が face ROI の生成式と consistency utility を提供する。本タスクはそれを利用し、face ROI の geometry を再定義しない。
    - 後続 reliability/debug task が `roi` / `source` / `warnings` を ReliabilityMap と motion-debug viewer に接続する。

## 実装方針（既存コード整合: file:line）

- `SincroFaceMotionSnapshot` は現状 headPose、blendshapes、inference timing、fallbackReason だけを持つ（`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceMotionSnapshot.ts:1`、`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceMotionSnapshot.ts:8`）。本タスクでは optional metadata を追加して既存 consumer を壊さない。
- `SincroFaceTracker.detect()` は FaceLandmarker `detectForVideo()` を呼び、`normalizeResult()` で snapshot を作る（`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:42`、`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:52`、`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:114`）。ROI 版も同じ normalization を共有する。
- FaceLandmarker は `numFaces: 1`、blendshapes、facial transformation matrix を出す設定である（`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:94`、`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:100`、`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:104`）。ROI v1 もこの model options を変えない。
- Worker は現在 Face を Pose より先に実行している（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:118`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:119`）。Face ROI は Pose snapshot を必要とするため、Pose が実行される frame では実行順を Pose -> Face ROI に変更し、同一 frame で FaceLandmarker を二重実行しない。Pose が走らない frame は既存 full-frame Face を使う。
- `TrackerRuntime.predictWithWorker()` は result の `face` を必ず callback し、`pose` があれば pose callback している（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:235`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:236`）。Face ROI 追加後も `onFaceMotion` は毎 inference frame で呼ぶ。
- motion design doc は head 専用 reliability 接続を Phase 8 以降へ残している（`documents/design/frontend/character/motion.md:182`）。本タスクは tracker snapshot metadata までとし、reliability 接続は後続 task へ残す。

## テスト

- `cd sincromisor-frontend && npm run test -- sincroFace`
- `cd sincromisor-frontend && npm run test -- roiCoordinateMapping`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible face tracking snapshot と tracker orchestration を変更するため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に Face ROI source、fallback、Pose cadence との関係、head reliability への接続を後続 task に残す境界を同期する。
