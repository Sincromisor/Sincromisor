# character animation 3.0 phase 8 pose seeded hand ROI tracking

## 背景 / 目的

Phase 8 では、Pose wrist を起点に left / right hand crop を作り、Hand Landmarker の結果を full-frame 座標へ戻して body-local canonical / reliability の材料にする。調査資料は、Hand image landmarks は palm basis、finger curl、finger splay、thumb oppose に使い、Hand wrist を腕 IK target の主値にしないことを推奨している（`documents/research/character_animation/answers/01-mediapipe-tracking.md:82`、`documents/research/character_animation/roadmap.md:241`）。

このタスクでは、本タスクの依存で追加された ROI contract を使い、HandLandmarker を Pose-seeded ROI で実行する tracker と snapshot を追加する。Gesture Recognizer と MotionIntent は Phase 9 に残し、Phase 8 では palm / finger の低次元観測と左右割当、ROI failure 時の full-frame fallback までを扱う。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts` を追加し、`SincroHandMotionSnapshot`、`SincroHandSideSnapshot`、`SincroHandFeatureSnapshot`、`DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT` を export する。
- [ ] `SincroHandMotionSnapshot` は `trackingEnabled`、`detected`、`leftHand`、`rightHand`、`inferenceTimeMs`、`inferenceFps`、`lastUpdatedAtMs`、`fallbackReason` を持つ。左右 hand snapshot は `detected`、`assignedSide`、`source`、`confidence`、`handednessLabel`、`handednessScore`、`roi`、`fullFrameWrist`、`features`、`warnings` を持つ。
- [ ] snapshot の最小 schema は次に固定する。`SincroHandTuple3` は `readonly [number, number, number]`、`SincroHandPoint2` は `readonly [number, number]` とする。

```ts
export type SincroHandSource = "roi" | "full-frame-fallback" | "previous" | "lost";
export type SincroHandWarningCode =
    | "roi_missing"
    | "roi_inconsistent"
    | "side_inconsistent"
    | "duplicate_assignment"
    | "landmarks_missing"
    | "low_confidence"
    | "pose_stale_for_roi"
    | "model_not_loaded";

export type SincroHandFeatureSnapshot = {
    palmNormal: SincroHandTuple3;
    palmDirection: SincroHandTuple3;
    fingerCurl: {
        thumb: number;
        index: number;
        middle: number;
        ring: number;
        little: number;
    };
    fingerSplay: {
        indexMiddle: number;
        middleRing: number;
        ringLittle: number;
    };
    thumbOppose: number;
    openness: "open" | "half" | "closed" | "unknown";
};

export type SincroHandSideSnapshot = {
    detected: boolean;
    assignedSide: "left" | "right";
    source: SincroHandSource;
    confidence: number;
    handednessLabel?: string;
    handednessScore: number;
    roi?: SincroRoiObservation;
    fullFrameWrist?: SincroHandPoint2;
    features: SincroHandFeatureSnapshot;
    warnings: SincroHandWarningCode[];
};
```

- [ ] feature 値域は `palmNormal` / `palmDirection` が正規化済み tuple3、`fingerCurl.*` / `fingerSplay.*` / `thumbOppose` / `confidence` / `handednessScore` が `0..1` に固定する。非 finite 入力は 0 に clamp し、該当 side に `low_confidence` または `landmarks_missing` を残す。
- [ ] default lost hand は `detected = false`、`source = "lost"`、`confidence = 0`、`handednessScore = 0`、`fullFrameWrist = undefined`、`palmNormal = [0, 0, 1]`、`palmDirection = [0, -1, 0]`、全 scalar feature `0`、`openness = "unknown"`、`warnings = ["landmarks_missing"]` とする。
- [ ] `openness` は `averageCurl = mean(index, middle, ring, little)` から決める。`averageCurl <= 0.35` は `"open"`、`0.35 < averageCurl < 0.72` は `"half"`、`averageCurl >= 0.72` は `"closed"`、landmark 欠損または confidence `< 0.2` は `"unknown"` に固定する。
- [ ] `fullFrameWrist` と palm / finger 用 tuple は full-frame normalized coordinate または normalized hand-local feature に限定し、MediaPipe landmark object を snapshot に保存しない。
- [ ] `sincromisor-frontend/src/features/gaze/handTracking/sincroHandTracker.ts` を追加し、`HandLandmarker` を `/3rd_party/hand_landmarker.task` から初期化する。model 未ロード、初期化失敗、推論例外時は fallback snapshot を返し、runtime 全体を throw で停止しない。
- [ ] `SincroHandTracker.detect(videoFrame, poseSnapshot, timestampMs, options)` は依存タスクの `createHandRoiFromPoseArm()` で left / right ROI を作り、ROI が valid な side だけ crop 推論する。両 side の ROI が invalid の場合は full-frame Hand pass を 1 回だけ実行し、`source = "full-frame-fallback"` とする。
- [ ] ROI crop は canvas / `createImageBitmap()` を tracker 内部 helper に閉じ、snapshot には crop object を保存しない。crop local landmark は `mapCropPointToFullFrame()` で full-frame normalized coordinate へ戻す。
- [ ] 左右割当は Hand handedness 単独で決めず、Pose wrist との full-frame distance を主条件にする。初期 v1 は left / right 各 ROI に対し、復元後 wrist と対象 Pose wrist の距離が最小かつ `<= 0.18` の結果だけ採用し、距離超過は warning `side_inconsistent` として捨てる。
- [ ] full-frame fallback では検出 hand ごとに Pose left/right wrist との距離で assignment し、同じ hand result を両 side に割り当てない。両 wrist から同距離の場合は前フレーム assignment がある side を優先し、前フレームがない場合は confidence が高い side だけ採用して反対 side は lost にする。
- [ ] Hand wrist は腕 IK target の主値にしない。`SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` は本タスクで変更せず、Hand result は hand / finger / palm feature snapshot と reliability 材料に限定する。
- [ ] Worker 経路に `hand?: SincroHandMotionSnapshot` を追加し、`TrackerRuntimeCallbacks` に optional `onHandMotion` を追加する。callback が未指定でも既存 Face / Pose 経路は現状通り動作する。
- [ ] `TrackerRuntimePoseOptions` に `hand?: { enabled?: boolean; targetInferenceFps?: number }` を追加する。Hand tracking は `poseOptions.enabled === true` かつ `poseOptions.hand?.enabled === true` の場合だけ有効化する。`onHandMotion` の有無だけでは Hand を起動しない。
- [ ] Worker protocol は `SincroTrackerWorkerInitMessage` / `SincroTrackerWorkerDetectMessage` に `handEnabled: boolean` を追加する。`handEnabled = true` でも `poseEnabled = false` の場合は Worker 側で Hand を実行せず、stopped/lost hand snapshot を返す。
- [ ] Hand cadence v1 は `TrackerRuntime` 内で `lastHandInferenceAtMs` と `targetHandInferenceFps` を持ち、既定 `4fps`、指定範囲 `1..8fps` に clamp する。main-thread fallback でも Hand tracking は動作するが、effective hand fps は `<= 4fps` に clamp する。Worker unavailable 時に Hand が原因で face / pose まで停止しない。
- [ ] Worker stats に optional `effectiveHandFps?: number` を追加する。本タスクでは ROI over-budget degradation や skip reason count は追加せず、後続 cadence/fallback task の責務に残す。
- [ ] `sincromisor-frontend/src/features/gaze/handTracking/__tests__/sincroHandMotionSnapshot.test.ts` または `sincroHandTracker` の helper test で、ROI 座標復元、Pose wrist distance assignment、duplicate assignment rejection、lost fallback snapshot、feature `openness` 境界を検証する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に Hand snapshot、feature 値域、ROI fallback、Hand wrist を IK 主 target にしない境界、Gesture を Phase 9 に残す方針を同期する。

## 設計判断（着手前に確定済み）

- 新規 Hand tracker は `src/features/gaze/handTracking/` に置く。Pose tracker と同じ MediaPipe 観測層であり、canonical / reliability / retargeting に置くと責務が混ざるため採用しない。
- Hand snapshot は low-dimensional feature snapshot に固定する。MediaPipe landmarks 全点を保存する案は replay / debug で重く、後段が raw landmark を再解釈しやすくなるため採用しない。
- v1 の assignment は Pose wrist distance を主条件にする。Hand handedness は鏡像・腕交差・再検出で不安定になり得るため、単独正本にしない。
- Hand 有効化は `poseOptions.hand.enabled` に固定する。`onHandMotion` callback があるだけで起動する案は、既存 consumer が callback を観測目的で渡しただけで推論負荷が増えるため採用しない。
- ROI が invalid な場合は full-frame fallback を 1 回だけ実行する。left/right それぞれで full-frame fallback を実行する案は同一 frame の推論負荷が大きく、Phase 8 の性能目標に合わないため採用しない。
- `GestureRecognizer` は本タスクで使わない。Gesture は Phase 9 の MotionIntent 補助入力であり、Phase 8 では hand reliability が揃う前に gesture label を流さない。
- Hand model asset は既存 `public/3rd_party/hand_landmarker.task` を使う。新規 model 取得や network fetch は行わない。

## スコープ境界

- 本タスクでやること:
    - Hand snapshot / tracker / ROI crop / coordinate復元。
    - Worker / main-thread runtime への optional hand callback 追加。
    - Pose wrist 主体の left/right assignment。
    - Hand feature の unit test。
- 本タスクでやらないこと:
    - Gesture Recognizer / MotionIntent。
    - finger VRM bone への適用。
    - ReliabilityMap への hand reliability 統合。
    - motion-debug viewer / replay log の hand layer 表示。
    - Hand result を腕 IK target へ上書きすること。
    - hand model asset の追加取得。
- 依存タスクとの境界:
    - ROI contract task が ROI 型、座標復元、ROI consistency を提供する。本タスクはその utility を利用し、ROI の式自体を再定義しない。
    - 後続 reliability/debug task が hand snapshot を ReliabilityMap / motion-debug log に接続する。

## 実装方針（既存コード整合: file:line）

- Face tracker は MediaPipe tracker class が model lifecycle、`detectForVideo()`、snapshot normalization、fallback を所有する構造である（`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:13`、`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:42`、`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:197`）。Hand tracker も同じ facade pattern にする。
- Pose tracker は MediaPipe result をすぐ normalized snapshot へ変換し、生 landmark を外へ出していない（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts:56`、`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts:75`）。Hand tracker も raw result を snapshot 外へ漏らさない。
- Worker は現在 FaceTracker / PoseTracker を import し、Face -> Pose の順に実行して result を返している（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:101`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:118`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:123`）。Hand は Pose result の ROI を使うため、Worker 内順序は Face / Pose / Hand のうち Hand を Pose 後に実行する。
- Worker result message は現在 `face` と optional `pose` を返す（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:66`）。本タスクでは optional `hand` を追加し、未指定 callback の互換を保つ。
- `TrackerRuntimeCallbacks` は optional `onPoseMotion` を持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:24`）。`onHandMotion` も optional にし、既存利用者の変更量を抑える。
- `TrackerRuntimePoseOptions` は現在 `enabled`、`targetInferenceFps`、`ignorePerformanceFallback` だけを持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:32`）。本タスクでは `hand` sub option をここへ追加し、Face / Pose の既存 options 名は変更しない。
- public asset には `hand_landmarker.task` が存在する（`sincromisor-frontend/public/3rd_party/hand_landmarker.task`）。本タスクではその配置を前提にする。
- roadmap は Hand Landmarker を palm basis、finger curl、finger splay、thumb oppose の補助に使うと明記している（`documents/research/character_animation/roadmap.md:242`）。snapshot はこの用途に必要な低次元値へ落とす。

## テスト

- `cd sincromisor-frontend && npm run test -- sincroHand`
- `cd sincromisor-frontend && npm run test -- roiCoordinateMapping`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible tracking snapshot と Worker callback を拡張するため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に Hand snapshot、ROI fallback、Hand wrist を IK 主 target にしない境界、Gesture を Phase 9 に残す方針を同期する。
