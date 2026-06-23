# character animation 3.0 canonical arm feature extraction

## 背景 / 目的

Phase 2 の中心は、wrist absolute position や VRM bone rotation ではなく、body-local な意味量で腕の動きを説明できるようにすることである。roadmap は腕を `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification` へ落とし、IK / Temporal / MotionIntent / AvatarMotionProfile が同じ名前と単位を読むことを求めている。

このタスクでは、依存タスクの torso frame を使い、`SincroPoseMotionSnapshot` から左右腕の canonical feature を抽出する pure function を追加する。`motion-debug` への保存と viewer 接続は後続タスクに分ける。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts` を追加し、`createCanonicalUpperBodyState(input)`、`extractCanonicalArmState(input)`、`CanonicalArmFeatureInput` を export する。
- [ ] `createCanonicalUpperBodyState()` は `SincroPoseMotionSnapshot`、`CanonicalTorsoFrameResult`、任意の previous canonical state、`mediaTimeMs` を受け取り、依存タスクの `CanonicalUpperBodyState` を返す。
- [ ] `extractCanonicalArmState(input)` は本タスクの「設計判断」にある `CanonicalSingleArmFeatureInput` を受け取り、指定 side 1 本分の `CanonicalArmState` を返す。左右両腕を返したり、中間 object を返したりしない。
- [ ] 左右腕ごとに `bodyLocalWrist` と `bodyLocalElbow` を、torso frame の `bodyRight` / `bodyUp` / `bodyFront` への dot product で計算する。VRM retarget frame、IK quaternion、AnimationMixer 出力は入力にしない。
- [ ] `reach` は shoulder から wrist までの body-local 距離を、`shoulder-elbow + elbow-wrist` の腕長で割った値として計算し、`0..1.15` に clamp する。腕長が不正な場合は `reach=0`、`confidence=0`、`warnings` に `missing_world_coordinates` を入れる。
- [ ] `elevationRad` は shoulder から wrist への body-local 方向の Y 成分から `asin()` で計算し、`[-Math.PI / 2, Math.PI / 2]` に clamp する。
- [ ] `openness` は anatomical side から見た横開き量に固定する。右腕は body-local X が正のとき、左腕は body-local X が負のとき positive とし、値域は `-1..1` に clamp する。
- [ ] `forwardness` は `bodyLocalDirection`、MediaPipe world Z 補助、2D 投影短縮の複合スコアで計算する。重み、`projectionShortening` の式、補助入力欠損時の再正規化は本タスクの「設計判断」に固定し、world Z や 2D 入力が欠損しても finite な `0..1` を返す。
- [ ] `elbowFlexionRad` は elbow を頂点にした upper arm / lower arm の角度から、伸び切りを `0`、強く曲げた状態を `Math.PI` に近づける定義で計算する。
- [ ] `classification` は `unknown`、`front`、`side`、`diagonal`、`crossed` の deterministic rule に固定する。confidence < 0.15 は常に `unknown`、`openness < -0.25` は `crossed` を優先する。
- [ ] `confidence` は pose arm confidence、shoulder / elbow / wrist world confidence、torso confidence の最小値を基本にし、本タスクの「設計判断」にある confidence clamp 条件に該当する場合は最大 `0.45` に clamp する。source は Phase 2 では `"pose"` または `"neutral"` のみを返す。
- [ ] clamp した field は `outOfRangeFields` に `path`、元値、min / max、clampedValue を記録する。parse 可能な canonical state には clamp 後の値だけを保存する。
- [ ] `sincromisor-frontend/src/character/canonical/__tests__/canonicalArmFeatureExtractor.test.ts` を追加し、neutral、片腕 side、front、crossed、world Z 欠損、腕長不正、範囲 clamp の各ケースを検証する。
- [ ] `documents/design/frontend/character/motion.md` に arm canonical feature の名前、単位、classification rule、VRM rotation を含めない方針を同期する。

## 設計判断（着手前に確定済み）

- arm feature extractor は `src/character/canonical/` に置く。既存 `src/character/retargeting/sincroPoseArmRetargeter.ts` へ直接入れる案は、retargeter が VRM 向け additive rotation と IK mode selection を担当しており、canonical state の「VRM 非依存」境界を曖昧にするため採用しない。
- 入力型は次に固定する。

```ts
type CanonicalArmFeatureInput = {
    pose: SincroPoseMotionSnapshot;
    torso: CanonicalTorsoFrameResult;
    previous?: CanonicalUpperBodyState;
    mediaTimeMs: number;
};

type CanonicalSingleArmFeatureInput = {
    side: "left" | "right";
    arm: SincroPoseArmMotionSnapshot;
    torso: CanonicalTorsoFrameResult;
};
```

`createCanonicalUpperBodyState(input)` は `pose.leftArm` と `pose.rightArm` から `CanonicalSingleArmFeatureInput` を組み立て、`extractCanonicalArmState()` を 2 回呼ぶ。`extractCanonicalArmState()` は片腕の `CanonicalArmState` だけを返し、timestamp、calibration、head、左右 map の組み立ては `createCanonicalUpperBodyState()` の責務にする。

- body-local 変換は `point - torso.shoulderCenter` を `bodyRight`、`bodyUp`、`bodyFront` に射影して作る。Three.js `Vector3` は使わず、tuple helper の pure function で実装する。
- `DEFAULT_FORWARDNESS_WEIGHTS` は次に固定する。

```ts
const DEFAULT_FORWARDNESS_WEIGHTS = {
    bodyLocalDirection: 0.55,
    worldZ: 0.25,
    projectionShortening: 0.2,
} as const;
```

- `bodyLocalDirection` は `clamp01((wristLocal.z - shoulderLocal.z) / max(torso.shoulderWidth, 0.001))` とする。`worldZ` は wrist / shoulder の `world.normalizedZ` 差分が finite の場合だけ `clamp01((deltaZ + 1) / 2)` を使う。`projectionShortening` は 2D shoulder-wrist 距離が腕長に比べて短いほど前方向とみなす補助で、入力欠損時は重みを bodyLocalDirection へ寄せる。
- `projectionShortening` は次の式に固定する。

```ts
const imageUpperArmLength = distance2d(shoulder.camera, elbow.camera);
const imageLowerArmLength = distance2d(elbow.camera, wrist.camera);
const imageArmLength = imageUpperArmLength + imageLowerArmLength;
const imageReach = distance2d(shoulder.camera, wrist.camera);
const projectionShortening =
    imageArmLength > 0.0001
        ? clamp01(1 - imageReach / imageArmLength)
        : undefined;
```

`distance2d` は `cameraX/Y` の Euclidean distance とする。shoulder / elbow / wrist のいずれかが `hasFiniteCoordinates === false` の場合、または `imageArmLength <= 0.0001` の場合、`projectionShortening` は欠損として扱う。

- `forwardness` の補助入力欠損時は、利用可能な成分だけで重みを再正規化する。

```ts
const weighted =
    bodyLocalDirection * 0.55 +
    (worldZ === undefined ? 0 : worldZ * 0.25) +
    (projectionShortening === undefined ? 0 : projectionShortening * 0.2);
const weightSum =
    0.55 +
    (worldZ === undefined ? 0 : 0.25) +
    (projectionShortening === undefined ? 0 : 0.2);
const forwardness = clamp01(weighted / weightSum);
```

`bodyLocalDirection` は body-local wrist が取れない場合も `0` として必ず参加するため、`weightSum` は 0 にならない。

- `classification` rule は次に固定する。
    - `confidence < 0.15`: `unknown`
    - `openness < -0.25`: `crossed`
    - `forwardness >= 0.62 && Math.abs(openness) < 0.35`: `front`
    - `Math.abs(openness) >= 0.45 && forwardness < 0.45`: `side`
    - `forwardness >= 0.35 && Math.abs(openness) >= 0.25`: `diagonal`
    - それ以外: `unknown`
- `elbowFlexionRad` は `Math.PI - angleBetween(elbowToShoulder, elbowToWrist)` とし、まっすぐ伸びた腕を `0`、折りたたまれた腕を大きい値として扱う。
- confidence clamp 条件は次に固定する。world Z 補助欠損と projection shortening 欠損だけでは confidence を下げない。
    - torso confidence < 0.45 または torso に `torso_frame_unreliable` warning がある。
    - shoulder / elbow / wrist のいずれかで world coordinates が欠損し、body-local point を fallback した。
    - arm length が `<= 0.0001` または finite ではない。
    - `arm.tracked === false` またはいずれかの joint `quality === "lost"`。
- Hand Landmarker、finger curl、gesture label は Phase 9 の責務であり、本タスクでは `CanonicalArmState` の手指 field を増やさない。

## スコープ境界

- 本タスクでやること:
    - body-local arm feature 抽出。
    - `CanonicalUpperBodyState` の pose-only 生成。
    - clamp / warning / outOfRangeFields の記録。
    - arm feature の unit test。
    - motion design 文書への feature 名と単位の同期。
- 本タスクでやらないこと:
    - `motion-debug` log への `frame.canonical` 保存。
    - live viewer / replay viewer の canonical 表示。
    - Temporal smoothing、dropout prediction、recovery blending。
    - Hand / Face / Gesture 由来の wrist / finger / intent 追加。
    - IK target や VRM normalized pose の生成。

## 実装方針（既存コード整合: file:line）

- 既存 pose snapshot の腕は `SincroPoseArmMotionSnapshot` として `tracked`、`confidence`、既存 feature、`targets` を持つ（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:60`）。本タスクの canonical feature は既存 `upperArmLift` などをそのままコピーせず、target point から body-local に再計算する。
- 腕 target は shoulder / elbow / wrist の `SincroPoseTargetPointSnapshot` である（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:45`）。body-local feature はこの 3 点から生成する。
- `SincroPoseTargetPointSnapshot.world` には normalized world target と confidence が分離されている（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:5`）。world target 欠損時は `missing_world_coordinates` warning を付け、camera 2D target だけで `forwardness` を補助する。
- 既存 retarget frame は upper body / arm の VRM 向け additive rotation と IK solver snapshot を持つ（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:24`）。canonical extractor はこの値を読まない。
- motion metrics は現在 `frame.poseSnapshot` と `frame.solver.poseRetarget` を読む（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:215`）。本タスクでは metrics 入力を変更せず、canonical metrics は後続 Phase 3 以降のタスクに残す。

## テスト

- `cd sincromisor-frontend && npm run test -- canonicalArmFeatureExtractor`
- `cd sincromisor-frontend && npm run build`
- synthetic pose snapshot で次を検証する:
    - neutral 全欠損で parse 可能な canonical state と `confidence=0` を返す。
    - 右腕を体の右へ開いた入力が `openness > 0` と `classification: "side"` になる。
    - 左腕を体の内側へ交差した入力が `openness < 0` と `classification: "crossed"` になる。
    - wrist が bodyFront 方向へ出た入力が `forwardness >= 0.62` と `classification: "front"` になる。
    - world Z 欠損でも `forwardness` が finite な `0..1` になる。
    - 腕長不正で NaN を出さず warning と `confidence=0` を返す。
    - clamp された field が `outOfRangeFields` に記録される。
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、後続 IK / Temporal / MotionIntent が読む内部公開 contract を追加するため、`documents/design/frontend/character/motion.md` に arm canonical feature の名前、単位、classification rule、VRM rotation を含めない方針を同期する。
