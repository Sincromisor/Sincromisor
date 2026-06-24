# character animation 3.0 phase 4 pose reliability estimator

## 背景 / 目的

Phase 4 の中核は、MediaPipe の `presence` / `visibility` / tracker confidence をそのまま最終判断にせず、border risk、骨長整合、body scale、temporal innovation、camera quality などを合成して、joint / part ごとの制御用 weight に変換することである。

このタスクでは、前段の `ReliabilityMap` contract に基づき、既存 `SincroPoseMotionSnapshot`、任意の前回 `SincroPoseMotionSnapshot`、`CameraQualityScore` から計算できる pose reliability estimator を追加する。Hand / Face / Gesture / ROI 専用 reliability は後続 Phase 8 / 9 に残し、Phase 4 の最小実装として shoulder / elbow / wrist / head / torso / arms を扱う。

依存: `task-260625035438-character-animation-3-phase-4-reliability-contract`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts` を追加し、`createPoseReliabilityMap(input)` を export する。戻り値は `ReliabilityMap` v1 とし、`parseReliabilityMap()` を通る。
- [ ] 入力は `pose: SincroPoseMotionSnapshot`、`cameraQuality?: CameraQualityScore`、`previous?: { pose: SincroPoseMotionSnapshot; mediaTimeMs: number; reliability?: ReliabilityMap }`、`mediaTimeMs: number`、`video: { width: number; height: number }` に固定する。`performance.now()` は estimator 内で呼ばず、時刻は caller が渡す。
- [ ] joint reliability は shoulder / elbow / wrist / head placeholder / hand placeholder を含める。Pose だけで未観測の `head`、`leftHand`、`rightHand` は `state: "lost"`、`finalWeight: 0`、`warnings: ["not_available_in_pose_snapshot"]` とする。
- [ ] part reliability は `torso`、`leftArm`、`rightArm` を pose から計算し、`head`、`leftHand`、`rightHand`、`leftFinger`、`rightFinger` は lost placeholder とする。
- [ ] `modelPresence` / `modelVisibility` / `tracking` は `SincroPoseTargetPointSnapshot.presence`、`visibility`、`confidence` / `tracked` / `quality` から決定する。`quality: "strong"` は tracking 1、`"weak"` は 0.45、`"lost"` は 0 とする。
- [ ] `border` は target の `cameraX` / `cameraY` が `0..1` 外、または最短端距離が `0.04` 未満なら `bad_border` reason を付けて score を下げる。`0.04..0.16` は smoothstep で `0..1` に上げ、`0.16` 以上は 1 とする。
- [ ] `boneLength` は upper arm / lower arm の world coordinates が揃う場合に左右腕ごとに評価する。`upper / lower` ratio が `0.55..1.80` なら score 1、`0.35..0.55` または `1.80..2.40` なら score 0.55 + `bone_length_inconsistent`、範囲外なら score 0.15 + `bone_length_inconsistent` とする。previous pose があり、同じ腕の total arm length ratio `current / previous` が `1/1.35..1.35` 外なら score を最大 0.55、`1/1.80..1.80` 外なら最大 0.15 に下げ、`bone_length_inconsistent` を付ける。world coordinates が欠ける場合は score 0.5、reason `missing_world_coordinates` とする。
- [ ] `bodyScale` は `pose.upperBody.shoulderWidth` を使う。`pose.detected === false`、非 finite、または `shoulderWidth <= 0` なら score 0 + `body_scale_missing` とする。previous pose があり、previous `shoulderWidth > 0` のとき `current / previous` が `1/1.35..1.35` なら score 1、`1/1.80..1/1.35` または `1.35..1.80` なら score 0.55 + `body_scale_jump`、範囲外なら score 0.15 + `body_scale_jump` とする。previous がない場合の valid shoulder width は score 1 とする。
- [ ] `temporal` は previous pose がある場合だけ、wrist / elbow / shoulder の normalized image coordinate 差分を `dtSec = (mediaTimeMs - previous.mediaTimeMs) / 1000` で割った speed を評価する。previous がない場合は score 1 とする。`dtSec <= 0` は score 0.5 + `invalid_dt`。speed `<= 2.0` は score 1、`2.0..8.0` は `1 - ((speed - 2.0) / 6.0) * 0.8` + `temporal_jump`、`> 8.0` は score 0.1 + `temporal_jump` とする。
- [ ] `cameraQuality` component は `CameraQualityScore.overall.score` を使う。camera quality が未渡しなら 0.75 + `camera_quality_missing` とし、pose 自体を lost にしない。
- [ ] `finalWeight` は component の積ではなく幾何平均にする。0 component がある場合でも `max(score, 0.001)` を使って完全 0 連鎖を避け、最終的に `state` が `"lost"` の部位だけ `finalWeight: 0` にする。
- [ ] state 境界は `finalWeight >= 0.65` を `tracked`、`0.05 <= finalWeight && finalWeight < 0.65` を `suspect`、`finalWeight < 0.05` を `lost` とする。`predicted` / `recovering` は Phase 5 の TemporalStateEstimator が使うため、本 estimator は返さない。
- [ ] estimator のユニットテストで、画面端 wrist、lost elbow、world coordinate 欠損、cameraQuality bad、previous からの wrist jump、pose fallback snapshot の各ケースが期待する component reason / state / finalWeight を返すことを確認する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に、Phase 4a の estimator が Pose snapshot + optional previous pose / mediaTime / previous reliability + CameraQualityScore を入力にし、Hand / Face / ROI / Gesture は placeholder にすることを同期する。

## 設計判断（着手前に確定済み）

- estimator は `character/reliability` に置き、`features/gaze/poseTracking` へ逆依存を増やさない。`SincroPoseMotionSnapshot` は既に camera / world / confidence を含む tracker snapshot であり（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:25`、`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:79`）、この snapshot を読み取る pure function とする。
- `head` は Pose snapshot に nose / ears / eyes がないため placeholder に固定する。Face snapshot を混ぜると Phase 4a が大きくなるため、Face transformation matrix 由来 head reliability は別タスクへ残す。
- `leftHand` / `rightHand` / finger / gesture も placeholder に固定する。Hand Landmarker / Gesture Recognizer / ROI は roadmap Phase 8 / 9 の責務であり、本タスクでは `ReliabilityMap` が後続拡張に耐える形かだけを確保する。
- `finalWeight < threshold` で観測を破棄しない。roadmap Phase 4 の完了条件どおり、低 weight の観測として後段へ渡すため、estimator の戻り値には全 joint / part を常に含める。
- temporal innovation は Phase 5 の状態推定ではなく、信頼度を下げる補助 component だけに限定する。prediction、velocity damping、recovering blend は本タスクでは実装しない。
- previous 入力は `ReliabilityMap` だけでは座標差分や骨長差分を計算できないため、前回 pose と前回 media time を含む object に固定する。`previous.reliability` は前回 state を参照したい場合の補助であり、temporal / boneLength / bodyScale の主計算には `previous.pose` を使う。

最小入力 shape:

```ts
type PoseReliabilityEstimatorInput = {
    pose: SincroPoseMotionSnapshot;
    cameraQuality?: CameraQualityScore;
    previous?: {
        pose: SincroPoseMotionSnapshot;
        mediaTimeMs: number;
        reliability?: ReliabilityMap;
    };
    mediaTimeMs: number;
    video: { width: number; height: number };
};
```

## スコープ境界

- 本タスクでやること:
    - Pose snapshot 由来の shoulder / elbow / wrist / torso / arm reliability 計算。
    - camera quality と previous pose / previous reliability を任意入力にした pure estimator。
    - placeholder 部位の deterministic lost reliability。
- 本タスクでやらないこと:
    - motion-debug live snapshot / recording への接続。
    - CanonicalUpperBodyState confidence や IK weight への反映。
    - Face / Hand / Gesture / ROI reliability。
    - segmentation mask の読み取り。
    - Phase 5 の `predicted` / `recovering` 状態遷移。

## 実装方針（既存コード整合: file:line）

- `SincroPoseTargetPointSnapshot` は `tracked`、`quality`、`confidence`、`visibility`、`presence`、`cameraX`、`cameraY`、`world` を持つ（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:25`）。joint component の主入力はここから読む。
- `SincroPoseArmMotionSnapshot` は arm 全体の `tracked` / `confidence` と shoulder / elbow / wrist targets を持つ（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:60`）。part reliability は joint finalWeight の幾何平均と arm confidence を合成する。
- `SincroPoseMotionSnapshot.upperBody` は `shoulderWidth` と `hipCenterTracked` を持つ（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:70`）。torso reliability は左右 shoulder、lower body hip targets、`hipCenterTracked`、shoulderWidth から作る。
- CameraQualityScore は `overall.score` と `components` を持つ pure score である（`sincromisor-frontend/src/features/gaze/trackingRuntime/cameraQualityScoreTypes.ts:36`）。Reliability estimator は guide message ではなく score / reason code だけを参照する。
- Canonical arm confidence は現在 `pose.arm.confidence`、world confidence、torso confidence を min 合成している（`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:195`）。本タスクではそこを変更せず、後続 downstream task で reliability を反映する。

## テスト

- `cd sincromisor-frontend && npm run test -- poseReliabilityEstimator`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

テスト fixture は `DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT` をベースに作り、入力を変えたときの `finalWeight` の相対大小だけでなく、reason code と state を期待値として固定する。

## ドキュメント同期の要否

要。内部 pipeline の developer-visible contract が増えるため、`documents/design/frontend/character/tracking.md` に Pose + optional previous pose + CameraQuality 由来の reliability component、`documents/design/frontend/character/motion.md` に Phase 4a では Hand / Face / Gesture を placeholder とする責務境界を同期する。公開 WebRTC / backend 契約は変更しない。
