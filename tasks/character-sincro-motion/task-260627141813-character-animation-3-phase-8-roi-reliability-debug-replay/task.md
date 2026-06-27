# character animation 3.0 phase 8 ROI reliability debug replay integration

## 背景 / 目的

Phase 4 では Pose snapshot だけで観測できない head / hand / finger / gesture を lost placeholder に固定し、Face / Hand / ROI / Gesture 専用 reliability は Phase 8 / 9 へ残している（`documents/design/frontend/character/tracking.md:139`、`documents/design/frontend/character/motion.md:36`）。Phase 8 の Hand / Face ROI tracker が入っても、ReliabilityMap、motion-debug recording、replay viewer に接続されなければ、ROI 座標変換ミスや左右取り違えを再現・検出できない。

このタスクでは、前段タスクが追加した Hand snapshot / Face ROI metadata を ReliabilityMap と motion-debug に接続する。VRM finger 適用や MotionIntent は Phase 9 に残し、Phase 8 では ROI / hand / face の観測品質を debug / replay で説明できる状態にする。

## 完了条件（受け入れ条件）

- [ ] `createPoseReliabilityMap()` の入力型を拡張し、optional `hand: SincroHandMotionSnapshot`、optional `face: SincroFaceMotionSnapshot` を受け取れるようにする。未指定時は現行と同じ placeholder を返す。
- [ ] `ReliabilityMap.joints.head` は Face ROI / full-frame Face が `detected = true` の場合、`source = "face"`、`modelPresence` / `tracking` / `roi` / `temporal` component を finite `0..1` で埋める。Face 未検出時は `lost` とし、snapshot 自体なしは `no_observation`、ROI metadata 欠損は `not_available_in_pose_snapshot`、ROI failure metadata ありは `roi_missing` / `roi_inconsistent` を reason に残す。
- [ ] `ReliabilityMap.joints.leftHand/rightHand` と `parts.leftHand/rightHand` は Hand snapshot が該当 side を検出した場合、`source = "hand"`、Hand ROI consistency と side consistency を component に反映する。Hand side が `side_inconsistent` の場合は `state = "suspect"` 以下、`finalWeight <= 0.45` にする。
- [ ] `parts.leftFinger/rightFinger` は Hand `features.openness !== "unknown"` の場合だけ `source = "hand"` とし、finger curl の finite 性と hand reliability を読む。全指関節 rotation は扱わない。
- [ ] Face / Hand / Finger reliability component の算出表は次に固定する。未記載 component は `goodComponent()`、cameraQuality は既存 `evaluateCameraQuality()` の結果を使う。

| 対象                    | 条件                                | component score / reasonCodes                                                                                                                                                                                                                                                                       | lost 判定 / warning                                                                 |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `joints.head`           | `face.detected === true`            | `modelPresence = face.confidence` + `model_presence_low` if `< 0.5`; `modelVisibility = face.confidence`; `tracking = face.source === "lost" ? 0 : face.confidence`; `roi = face.roi ? component(face.roi.confidence, face.roi.warnings includes "roi_inconsistent" ? ["roi_inconsistent"] : []) : component(0.55, ["not_available_in_pose_snapshot"])`; `temporal = previous head exists ? existing temporal helper : goodComponent()` | lost は `face.source === "lost"`。warnings は confidence `< 0.5` で `low_confidence` |
| `joints.head`           | `face` missing / not detected       | `modelPresence = 0`; `modelVisibility = 0`; `tracking = 0`; `roi = face === undefined ? component(0, ["no_observation"]) : face.roi === undefined ? component(0.55, ["not_available_in_pose_snapshot"]) : component(face.roi.confidence, mapRoiWarnings(face.roi.warnings))`                         | `state = "lost"`、warnings `["no_observation"]`                                     |
| `joints.left/rightHand` | side hand `detected === true`       | `modelPresence = hand.confidence`; `modelVisibility = hand.confidence`; `tracking = hand.source === "lost" ? 0 : hand.confidence`; `roi = hand.roi && hand.fullFrameWrist ? component(calculateRoiConsistency({ expected: hand.roi.referencePoint, observed: hand.fullFrameWrist }).score, mapped warnings) : component(0.55, ["not_available_in_pose_snapshot"])`; `side = warnings includes "side_inconsistent" ? component(0.35, ["side_inconsistent"]) : goodComponent()` | side inconsistent は `low_confidence` warning も付与                                 |
| `joints.left/rightHand` | side hand missing / not detected    | `modelPresence = 0`; `modelVisibility = 0`; `tracking = 0`; `roi = hand === undefined ? component(0, ["no_observation"]) : hand.roi === undefined ? component(0.55, ["not_available_in_pose_snapshot"]) : component(hand.roi.confidence, mapRoiWarnings(hand.roi.warnings))`; `side = goodComponent()` | `state = "lost"`、warnings `["no_observation"]`                                     |
| `parts.left/rightHand`  | side hand detected                  | 対応する `leftHand/rightHand` joint component をそのまま使う。`joints` は `["leftWrist", "leftHand"]` または `["rightWrist", "rightHand"]`                                                                                                                                                          | lost は hand joint lost または Pose wrist lost                                      |
| `parts.left/rightFinger`| `openness !== "unknown"`            | hand part component を base に、`tracking = component(hand.confidence, [])`、`modelPresence = component(minFiniteCurlScore, ["model_presence_low" if < 0.5])`。`minFiniteCurlScore` は thumb/index/middle/ring/little が finite なら `1`、非 finite があれば `0`                                | non finite curl は `low_confidence` warning                                         |
| `parts.left/rightFinger`| `openness === "unknown"` / missing  | `modelPresence = 0`; `modelVisibility = 0`; `tracking = 0`; `roi = hand === undefined ? component(0, ["no_observation"]) : hand.roi === undefined ? component(0.55, ["not_available_in_pose_snapshot"]) : component(hand.roi.confidence, mapRoiWarnings(hand.roi.warnings))`                         | `state = "lost"`、warnings `["no_observation"]`                                     |

- [ ] `mapRoiWarnings()` は ROI warning `"roi_missing"` を reason `"roi_missing"`、`"roi_inconsistent"` を reason `"roi_inconsistent"`、`"roi_clamped"` / `"roi_too_small"` / `"low_pose_quality"` を reason `"roi_inconsistent"` に写す。ROI warning が空なら reasonCodes は空配列にする。
- [ ] ROI metadata 欠損時の reason は、snapshot 自体が無い場合だけ `no_observation`、旧 snapshot / 旧 replay log のように `roi` field だけが無い場合は `not_available_in_pose_snapshot`、新規 ROI metadata があり failure warning を持つ場合は `mapRoiWarnings()` に固定する。`roi_missing` と `not_available_in_pose_snapshot` を同じ欠損に同時付与しない。
- [ ] Face reliability の ROI component は `face.roi.confidence` を正本にする。Face task が consistency score 0 の frame を full-frame fallback へ切り替えるため、本タスクでは face center を再計算しない。
- [ ] Hand reliability の ROI component は依存タスクの `calculateRoiConsistency()` を正本にし、`expected = hand.roi.referencePoint`、`observed = hand.fullFrameWrist` を渡す。`referencePoint` または `fullFrameWrist` が欠損する場合は `component(0.55, ["not_available_in_pose_snapshot"])` にする。
- [ ] `gesture` reliability は Phase 9 まで placeholder のまま維持する。Hand snapshot が存在しても Gesture Recognizer 未接続のため `source = "neutral"` または既存 unavailable 表現を保ち、gesture label を捏造しない。
- [ ] `calculateRoiConsistency()` は Hand reliability の ROI component だけに使う。`roi` metadata が欠損する旧 snapshot / 旧 replay log では `roi_missing` ではなく `not_available_in_pose_snapshot` とし、旧 log を failure にしない。
- [ ] reliability 生成責務は現行どおり `MotionDebugApp.updatePoseReliability()` に置く。`MotionDebugRecordingController.recordPoseFrame()` へ責務移動しない。`MotionDebugApp.updatePoseReliability()` が latest hand / face snapshot を `createPoseReliabilityMap()` へ渡し、生成済み reliability を `recordPoseFrame()` の既存 `reliability` 引数へ渡す。
- [ ] `MotionDebugSnapshot` に optional `hand` field を追加し、live snapshot / window API / viewer の `reliability` layer から hand / face ROI source、warnings、ROI consistency を確認できる。
- [ ] replay viewer は saved `frame.reliability` を正本にし、旧 log で hand / face reliability がない場合は existing fallback と同じく pose snapshot 由来 placeholder を表示する。invalid reliability は replay failure にせず `parseStatus: "invalid"` と raw value を表示する。
- [ ] `sincromisor-frontend/src/character/reliability/__tests__/poseReliabilityEstimator.test.ts` または新規 test で、Face detected head reliability、Hand detected hand/finger reliability、side inconsistent downweight、ROI missing old-log fallback、Gesture placeholder 維持を検証する。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` または recording controller test で、live hand snapshot、saved reliability、旧 log missing hand/face、invalid reliability の viewer status を検証する。
- [ ] `documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/overview.md` に Phase 8 の hand / face / ROI reliability、component 算出表、旧 log 互換、Gesture を Phase 9 に残す境界を同期する。

## 設計判断（着手前に確定済み）

- 既存 `ReliabilityMap` schema version は `sincro.reliability-map.v1` のまま維持する。schema には `head`、`leftHand`、`rightHand`、`leftFinger`、`rightFinger`、`roi` component、`hand` / `face` source が既に存在するため、同じ v1 の placeholder を実データで埋める変更として扱う。
- `createPoseReliabilityMap()` の名前は維持する。Phase 8 では pose を起点に hand / face ROI を統合するため、関数名だけを広げる大規模 rename は行わない。必要なら後続 Phase 10 で `createTrackingReliabilityMap()` へ整理する。
- Gesture reliability は本タスクで実データ化しない。Gesture は MotionIntent の補助入力であり、hand reliability が安定した後の Phase 9 で minimum duration / hysteresis と一緒に扱う。
- replay viewer は saved reliability を正本にする。hand / face snapshot から replay 時に再計算する案は、旧 log に hand / face observation が保存されていない場合に実カメラ由来の観測を復元できないため採用しない。
- ROI inconsistency は reliability の低下理由に留め、tracker snapshot をこのタスクで削除・補正しない。観測の採否は Hand / Face tracker task、下流の temporal / motion intent が担う。
- motion-debug の reliability 生成責務は `MotionDebugApp` に維持する。`MotionDebugRecordingController` は recording と canonical / temporal state 管理の境界であり、Hand / Face latest snapshot の収集まで移すと App / Controller の責務が逆転するため採用しない。

## スコープ境界

- 本タスクでやること:
    - Hand / Face snapshot を ReliabilityMap へ統合。
    - motion-debug live snapshot / recording / replay viewer への hand と ROI reliability 表示。
    - 旧 log 互換と invalid schema 表示の test。
    - Phase 8 debug / replay 設計文書同期。
- 本タスクでやらないこと:
    - Hand / Face tracker の MediaPipe 実行そのもの。
    - Gesture Recognizer / MotionIntent。
    - finger / wrist / head を VRM final pose へ反映すること。
    - ReliabilityMap schema version の変更。
    - raw MediaPipe landmarks の replay serializer。
- 依存タスクとの境界:
- Hand task は `SincroHandMotionSnapshot` と ROI source / warnings を提供する。
- Face task は `SincroFaceMotionSnapshot.roi/source/warnings` を提供する。
- ROI contract task `task-260627141812-character-animation-3-phase-8-roi-contract-coordinate-mappin` は `SincroRoiObservation` と `calculateRoiConsistency()` を提供する。
- Hand task `task-260627141812-character-animation-3-phase-8-pose-seeded-hand-roi-tracking` は `SincroHandMotionSnapshot` を `src/features/gaze/handTracking/sincroHandMotionSnapshot.ts` から export する。
- Face task `task-260627141812-character-animation-3-phase-8-pose-seeded-face-roi-tracking` は `SincroFaceMotionSnapshot.roi/source/warnings` を `src/features/gaze/faceTracking/sincroFaceMotionSnapshot.ts` に追加する。
- 本タスクはそれらを reliability / debug へ接続するだけで、tracker の assignment / fallback 方針は再定義しない。

## 実装方針（既存コード整合: file:line）

- ReliabilityMap は `head`、`leftHand`、`rightHand` joint と `leftHand`、`rightHand`、`leftFinger`、`rightFinger` part を既に持つ（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:71`、`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:83`、`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:166`）。schema 追加ではなく placeholder 解消として実装する。
- `createPoseReliabilityMap()` は現状 `head` / `leftHand` / `rightHand` を unavailable にしている（`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:129`、`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:176`、`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:179`）。本タスクでは optional hand / face 入力がある場合だけここを実データ化する。
- `createJointReliability()` は component set を finite score で埋め、`roi` component も既に存在する（`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:145`、`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:162`）。Hand / Face reliability も同じ component set を使う。
- `MotionDebugApp.updatePoseReliability()` は現状 `createPoseReliabilityMap()` を呼び、生成した reliability を `latestReliability` に入れている（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:704`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:710`）。本タスクではこの呼び出しに latest hand / face snapshot を渡す。
- `MotionDebugRecordingController.recordPoseFrame()` は reliability を受け取って live snapshot と frame reliability に保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:135`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:155`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:185`）。本タスクでは Controller へ生成責務を移さず、App 側で生成済み reliability を渡す。
- `MotionDebugSnapshot` は `reliability`、`canonical`、`temporal` を optional field として持つ（`sincromisor-frontend/src/pages/motionDebug/types.ts:167`、`sincromisor-frontend/src/pages/motionDebug/types.ts:173`）。`hand` も同じ developer-only snapshot として追加する。
- viewer layer は reliability saved value を parse し、invalid を layer value として表示する設計である（`sincromisor-frontend/src/pages/motionDebug/types.ts:72`、`sincromisor-frontend/src/pages/motionDebug/types.ts:123`）。ROI reliability でも replay failure にしない方針を維持する。
- tracking design doc は `Face / Hand / ROI / Gesture 専用 reliability は Phase 8 / 9` としている（`documents/design/frontend/character/tracking.md:139`）。本タスクは Face / Hand / ROI の範囲だけを回収し、Gesture は Phase 9 に残す。

## テスト

- `cd sincromisor-frontend && npm run test -- poseReliabilityEstimator`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible reliability / replay schema の埋まり方と motion-debug snapshot が変わるため、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/overview.md` に Phase 8 の hand / face / ROI reliability、旧 log 互換、Gesture を Phase 9 に残す境界を同期する。
