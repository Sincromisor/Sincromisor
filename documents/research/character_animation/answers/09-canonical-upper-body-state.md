# CanonicalUpperBodyState / 座標系 調査・設計レポート

対象: `sincromisor-frontend` / `sincro` モード / 単眼 Web カメラ + MediaPipe Pose・Hand・Face・Gesture + VRM 1.0 + Three.js + three-vrm
作成日: 2026-06-14

## 0. 結論

`CanonicalUpperBodyState` は、MediaPipe の landmark を VRM bone へ渡す前の単なる座標変換層ではなく、**不確実な観測値を、IK・時系列推定・semantic motion・AvatarMotionProfile が共有できる「体幹基準の意味量」へ変換する中核 contract** として設計すべきです。添付 09 の依頼でも、`forwardness`、IK target、filter の単位、metrics、AvatarMotionProfile の scale が後段ごとにずれないように、`CanonicalUpperBodyState` を明確化することが目的とされています。

推奨する処理順は次です。

```text
Camera / VideoFrame
  -> MediaPipe observations
  -> ReliabilityMap
  -> CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> MotionIntent
  -> AvatarMotionProfile
  -> IK / FK / Clip compose
  -> VRM normalized local pose
```

重要なのは、**`CanonicalUpperBodyState` には VRM bone rotation を入れない**ことです。ここでは「腕が上がっている」「体から開いている」「前に出している」「肘がどれだけ曲がっている」「手のひらがどちらを向いている」といった制御意味を定義し、実際の VRM bone 分配は後段の AvatarMotionProfile / IK / VrmPoseApplier に任せます。既存 roadmap でも、MediaPipe 出力を直接 VRM bone rotation に変換せず、Reliability → body-local canonical state → Temporal → MotionIntent → Avatar profile → IK/FK → VRM normalized local rotations へ流す方針が正本になっています。

---

## 1. 調査対象と現状整理

### 1.1 リポジトリ現状

`Sincromisor/Sincromisor` は公開リポジトリで、`sincromisor-frontend` 配下には `public`、`src`、`package.json`、Vite / TypeScript 関連設定が存在します。([GitHub][1]) `package.json` 上は React 19、Three.js `^0.182.0`、`@mediapipe/tasks-vision` `^0.10.34`、`@pixiv/three-vrm` `^3.5.1` を利用する構成です。([GitHub][2])

`src` 配下は `app`、`character`、`features`、`pages`、`shared`、`styles` に分かれており、既存の責務境界を活かして中間層を追加できる構造です。([GitHub][3]) `src/character` には `ik`、`retargeting`、`vrmCharacter` などがあり、`src/features/gaze` には `faceTracking`、`poseTracking`、`trackingRuntime` が存在します。([GitHub][4]) さらに `src/pages` には `motionDebug` と `poseLandmarkerSpike` が存在するため、Canonical state の可視化・replay・metrics を載せる足場は既にあります。([GitHub][5])

したがって今回の実装方針は、完全に別の `src/mocap` へ置き換えるよりも、既存の `features/gaze/*`、`character/retargeting`、`character/ik`、`pages/motionDebug` に橋渡しする **`character/canonical` または `character/motion/canonical` 層** を追加するのが妥当です。添付 roadmap も、既存の `trackingRuntime`、`poseTracking`、`character/retargeting`、`character/ik`、`pages/motionDebug` を足場として、中間層を太らせる方針を示しています。

### 1.2 MediaPipe 入力の事実関係

MediaPipe Pose Landmarker は、Web / JavaScript で人体 landmark を検出し、画像座標の body pose landmarks と 3D world coordinates を出力します。Pose の出力には 33 landmarks、`presence`、`visibility`、任意の segmentation mask が含まれ、world coordinates は「hips midpoint を原点とするメートル単位の 3D 座標」と説明されています。([Google AI for Developers][6]) ただし、単眼推定の z は安定した絶対奥行きではないため、添付資料の方針どおり、左右・上下・相対方向を主に使い、奥行きは圧縮して補助量として扱うべきです。

Hand Landmarker は hand landmarks の image coordinates、world coordinates、handedness を返し、Video / Live stream mode では hand presence と tracking confidence に応じて palm detection と tracking を切り替える仕様です。([Google AI for Developers][7]) そのため、アプリ側でも `Detected / Suspect / Predicted / Lost / Recovering` のような状態を持ち、handedness を Hand の結果だけで確定しない設計が必要です。

Face Landmarker は face mesh landmarks に加え、オプションで blendshape と facial transformation matrix を返せます。`outputFacialTransformationMatrixes` は canonical face model から検出顔への変換行列を出力するオプションです。([Google AI for Developers][8]) 今回は表情・視線が主スコープではないため、Face は **head orientation と torso yaw 補助**に限定して使うのがよいです。

Gesture Recognizer はリアルタイムの手 gesture と hand landmarks を返す Web 向けタスクで、認識結果には hand landmarks、world landmarks、handedness、gesture categories が含まれます。([Google AI for Developers][9]) ただし gesture は Canonical state の主入力ではなく、後段の MotionIntent 補助として扱うべきです。

---

## 2. 座標系定義

### 2.1 空間を 5 層に分離する

`CanonicalUpperBodyState` の最大の役割は、MediaPipe の座標値と VRM の bone local rotation を混同しないことです。添付 09 でも、image / MediaPipe world / camera / body-local / avatar-local / VRM normalized local pose の責務分離が主要論点として挙げられています。

| 空間                     | 原点                       | 軸                       | 単位              | 主な用途                            | 注意                        |
| ------------------------ | -------------------------- | ------------------------ | ----------------- | ----------------------------------- | --------------------------- |
| `ImageSpace2D`           | 左上                       | x 右、y 下               | 0〜1 正規化       | 画面内位置、border risk、2D gesture | preview mirror と混同しない |
| `MediaPipeWorldSpace`    | Pose は hips midpoint      | MediaPipe 定義           | Pose は m         | 相対方向、骨長整合性、z 補助        | 絶対 3D として過信しない    |
| `CameraObservationSpace` | カメラ入力基準             | 実装内部で統一           | 任意 / 正規化前   | Pose / Hand / Face 統合             | 外部には漏らさない          |
| `BodyLocalSpace`         | torso origin               | `R`,`U`,`F`              | body scale 正規化 | CanonicalUpperBodyState             | 後段 contract の中心        |
| `AvatarControlSpace`     | avatar torso / shoulder    | avatar profile 基準      | avatar 比率       | IK target、style 補正               | VRM bone rotation ではない  |
| `VRMNormalizedLocalPose` | 各 humanoid bone rest pose | three-vrm normalized rig | quaternion        | `setNormalizedPose()`               | Canonical の後段            |

three-vrm の `VRMHumanoid.getNormalizedPose()` / `setNormalizedPose()` は、normalized human bones の現在姿勢を `VRMPose` として扱い、各 transform は rest pose / T-pose からの local transform です。`normalizedRestPose` は `setNormalizedPose()` / `getNormalizedPose()` と互換ではないと明記されているため、Canonical state から最終 `VRMPose` を作る段階でも、毎フレーム「所有 bone の local delta」を明示的に構築する必要があります。([Pixiv][10])

### 2.2 左右・鏡像の扱い

設計上の原則は、**canonical の left / right は画面左・右ではなく、被写体の解剖学的 left / right とする**ことです。自撮り preview を CSS で左右反転する場合でも、MediaPipe 入力や canonical side を反転させてはいけません。

推奨ルールは次です。

```text
displayMirror:
  UI preview だけの属性

anatomicalSide:
  "left" | "right"
  MediaPipe Pose の left/right landmark と時系列 consistency で確定

screenSide:
  debug 表示用
  preview mirror の有無で変わってよい
```

Hand Landmarker の handedness は有用ですが、腕交差・顔前・画面端・再検出時に入れ替わる可能性があるため、Pose wrist との距離、前フレームの hand id、side continuity を併用して `anatomicalSide` に割り当てます。Google Research の Holistic 解説でも、Pose 予測を ROI prior として使うことで速い動きへの反応と左右一貫性を高め、left/right hand の混同を防ぐ設計が説明されています。([Google Research][11])

---

## 3. Torso frame 推定

### 3.1 基本式

体幹フレームは、腕・頭・手首・semantic motion の共通基準です。基本は Pose の shoulder / hip から作ります。

```text
shoulderCenter = (leftShoulder + rightShoulder) / 2
hipCenter      = (leftHip + rightHip) / 2

U0 = normalize(shoulderCenter - hipCenter)        // body up
R0 = normalize(rightShoulder - leftShoulder)      // subject right
F0 = normalize(cross(R0, U0))                     // body front candidate
```

この式は既存 report01 / report03 でも共通して使われていますが、単眼推定では `F0` が反転しやすいため、Face matrix、前フレーム、camera forward を併用して安定化する必要があります。

### 3.2 推奨アルゴリズム

```ts
type TorsoFrameSource =
    | "poseShoulderHip"
    | "poseShoulderFace"
    | "facePrevious"
    | "previousDecay"
    | "calibratedNeutral";

function estimateTorsoFrame(input: {
    pose: PoseObservation;
    face?: FaceObservation;
    previous?: CanonicalTorsoFrame;
    calibration: CalibrationState;
    reliability: ReliabilityMap;
}): CanonicalTorsoFrame {
    // 実装メモ:
    // 1. shoulders + hips が高信頼なら U/R を計算
    // 2. F candidate は cross(R, U)
    // 3. Face forward が高信頼なら F の符号と yaw を補助
    // 4. previous と dot < 0 なら反転候補を拒否または符号反転
    // 5. low confidence 時は previous -> neutral へ低速減衰
}
```

推奨する fallback 順は次です。

| 優先 | 条件                                  | 推定                                                       |
| ---: | ------------------------------------- | ---------------------------------------------------------- |
|    1 | shoulder / hip / face が高信頼        | `U`,`R`,`F` を Pose + Face + previous で推定               |
|    2 | hip が弱いが shoulder / face が高信頼 | `R` は shoulder、`U/F` は previous + Face                  |
|    3 | shoulder が片側欠落                   | 前フレーム `R` を保持し、Face yaw と torso center だけ更新 |
|    4 | Face のみ                             | head yaw を torso yaw へ弱く混ぜる                         |
|    5 | 全体低信頼                            | previous から calibrated neutral へ減衰                    |

`bodyFront` は毎フレーム単純な `cross(R,U)` で決めないでください。次の制約を入れます。

```text
if dot(F_candidate, F_previous) < 0:
    F_candidate = -F_candidate  // または candidate weight を大幅低下

if angularChange(torsoYaw) > maxYawSpeed * dt:
    clamp yaw delta

if torsoReliability < 0.45:
    freeze or decay to neutral
```

### 3.3 online calibration

online calibration で更新してよいのは、**人間側の neutral yaw / shoulder width / framing scale の低速推定**までです。VRM rest rotation、optional bone 方針、関節可動域、palm basis 軸定義は動的に変えてはいけません。

更新条件は厳しくします。

```text
torsoReliability > 0.85
headReliability  > 0.75
armMotionEnergy  < threshold
abs(torsoYawRate) < threshold
nearNeutralPose == true
duration > 500ms
```

更新係数は EMA で `alpha = 0.001〜0.005` 程度から始めます。初期 calibration は T pose ではなく、「正面自然姿勢 + 軽い A pose + 手の neutral」を 4〜6 秒程度で取得する方式が既存資料でも推奨されています。

---

## 4. 腕の canonical 意味量

### 4.1 保存すべき値

添付 09 で定義対象になっている `elevation`、`openness`、`forwardness`、`elbowFlexionHint`、`reach`、`side`、`armConfidence` は、すべて **BodyLocalSpace** で計算します。

```text
s = shoulder position
e = elbow position
w = wrist position

upper   = e - s
forearm = w - e
sw      = w - s

L_upper = calibrated upper arm length
L_lower = calibrated lower arm length
L_arm   = L_upper + L_lower
```

| 値                | 型 / 値域     | 定義                                      | 用途                        |                 |
| ----------------- | ------------- | ----------------------------------------- | --------------------------- | --------------- |
| `side`            | `"left"       | "right"`                                  | anatomical side             | IK / handedness |
| `reach`           | `0..1.15`     | `length(sw) / L_arm`                      | reach clamp / overextension |                 |
| `elevationRad`    | `[-π/2, π/2]` | `asin(dot(normalize(mix(sw, upper)), U))` | arm raise                   |                 |
| `openness`        | `[-1, 1]`     | `dot(normalize(sw), sideOut)`             | 横開き / 交差               |                 |
| `forwardness`     | `0..1`        | 複合スコア                                | 前出し                      |                 |
| `elbowFlexionRad` | `[0, π]`      | `π - angle(s-e, w-e)`                     | pole / extension 判定       |                 |
| `armConfidence`   | `0..1`        | joint reliability 合成                    | IK weight / filter          |                 |
| `classification`  | enum          | side / front / diagonal / unknown         | MotionIntent                |                 |

`sideOut` は、`R` が被写体右方向の場合、右腕は `+R`、左腕は `-R` です。

### 4.2 `forwardness` の定義

単眼カメラでは `world z` 単独で「前に出している」と判定してはいけません。既存資料でも、world z は低〜中信頼の補助成分で、左右・上下・相対方向を主に使い、奥行きは圧縮して扱う方針になっています。

推奨する `forwardness` は複合スコアです。

```text
f_dir =
  clamp01((dot(sw, F) / L_arm + 0.10) / 0.80)

f_worldZ =
  clamp01(compressedWorldZDelta)

f_projectedShortening =
  clamp01(1.0 - length(project(sw, R, U)) / max(length(sw), eps))

f_handSize =
  handConfidence > threshold
    ? clamp01((observedHandScale / calibratedHandScale - 1.0) / 0.8)
    : undefined

forwardness =
  weightedMean(
    f_dir                 * 0.45,
    f_worldZ              * 0.25,
    f_projectedShortening * 0.20,
    f_handSize            * 0.10
  )
```

「前」と「横」の判定は単一閾値ではなく、hysteresis を持つ状態として扱います。既存 report03 の基準を初期値にするなら、横に広げる判定は `openness > 0.55 && forwardness < 0.35`、前に出す判定は `forwardness > 0.45 && openness < 0.55`、斜め前は両方が `0.35` を超えるケースです。前方向への入状態は `0.50`、抜け状態は `0.35` 程度にして、ちらつきを避けます。

### 4.3 reliability 反映

腕の信頼度は、単に MediaPipe の confidence 平均ではなく、次を合成します。

```text
armConfidence =
  jointWeight(shoulder) *
  jointWeight(elbow) *
  jointWeight(wrist) *
  boneLengthConsistency *
  borderPenalty *
  temporalInnovationPenalty *
  extensionPenalty
```

骨長整合性は次のように扱えます。

```text
boneLengthWeight = exp(-abs(currentLength - calibratedLength) / sigma)
```

腕が伸び切っている場合、肘 pole は実測値より previous + fallback を優先します。既存資料では、`elbowFlexion < 15°` のときは pole を実測ではなく previous + fallback 優先にし、前フレームとの dot が負の場合や 60°/frame 以上の急変では measured pole の重みを大きく下げる方針が示されています。

---

## 5. head / wrist / hand / finger の入力優先順位

添付 09 の要求どおり、部位ごとに主入力と fallback を固定します。

| 部位              | 主入力                        | 補助入力                           | fallback            | Canonical に保存するもの                     |
| ----------------- | ----------------------------- | ---------------------------------- | ------------------- | -------------------------------------------- |
| torso             | Pose shoulder / hip           | Face yaw、previous                 | calibrated neutral  | `frame`, `yaw/pitch/roll`, `confidence`      |
| head              | Face transformation matrix    | Pose nose / eyes / ears            | previous + torso    | `headLocal`, `yaw/pitch/roll`, `source`      |
| wrist position    | Pose wrist                    | Pose elbow、Hand wrist crop center | previous predicted  | `wristBody`, `reach`, `velocityHint`         |
| wrist orientation | Hand palm basis               | forearm direction                  | previous roll decay | `palmNormal`, `palmForward`, `rollInfluence` |
| fingers           | Hand 21 landmarks             | Gesture Recognizer                 | neutral / previous  | `curl[5]`, `splay`, `thumbOppose`            |
| gesture           | Gesture Recognizer / 自前分類 | finger state                       | hysteresis hold     | `semanticHint`                               |

腕の位置は Pose wrist を主入力にし、Hand landmarks は手首向き・手指・hand presence の補助入力に限定します。これは、Hand Landmarker の crop 内推定が全身座標と必ずしも整合しないためです。一方で Hand の 21 landmarks は palm basis と finger curl / splay / oppose の推定には有効です。

指は最初から各関節の 3D rotation を完全復元しない方が安定します。three-vrm 側の既存設計でも、Hand Landmarker の 21 点を直接 finger bone rotation に変換するのではなく、`curl`、`spread`、`oppose` のような低次元値に落とし、VRM の存在する指 bone へ再分配する方針が推奨されています。

---

## 6. TypeScript 型案

実装コードそのものではなく、後段 contract と単位が分かる設計型として定義します。

```ts
export type CanonicalSide = "left" | "right";

export type CanonicalSource =
    | "pose"
    | "hand"
    | "face"
    | "gesture"
    | "previous"
    | "predicted"
    | "neutral"
    | "mixed";

export type Vec3Like = readonly [number, number, number];
export type QuatLike = readonly [number, number, number, number];

export type CanonicalFrameInfo = {
    frameId: number;
    timestampMs: number;
    mediaTimeMs?: number;
    dtMs: number;
    source: "live" | "replay";
};

export type CanonicalCoordinateMeta = {
    schemaVersion: 1;
    handedness: "anatomical";
    units: "body-normalized";
    previewMirrored: boolean;
};

export type CanonicalTorsoFrame = {
    origin: Vec3Like; // body-local origin in observation space
    right: Vec3Like; // R: subject right
    up: Vec3Like; // U: torso up
    front: Vec3Like; // F: torso front
    rotation: QuatLike; // camera/observation -> body frame
    confidence: number; // 0..1
    source: CanonicalSource;
    scale: {
        shoulderWidth: number;
        hipWidth?: number;
        torsoHeight: number;
    };
    angles: {
        yawRad: number;
        pitchRad: number;
        rollRad: number;
    };
};

export type CanonicalHeadState = {
    rotationLocal: QuatLike; // torso frame relative
    yawRad: number;
    pitchRad: number;
    rollRad: number;
    confidence: number;
    source: CanonicalSource;
};

export type CanonicalArmState = {
    side: CanonicalSide;

    shoulderBody: Vec3Like;
    elbowBody?: Vec3Like;
    wristBody: Vec3Like;

    reach: number; // 0..1.15
    elevationRad: number; // -pi/2..pi/2
    openness: number; // -1..1
    forwardness: number; // 0..1
    elbowFlexionRad?: number; // 0..pi

    poleHintBody?: Vec3Like;
    velocityBody?: Vec3Like;

    classification:
        | "rest"
        | "side"
        | "front"
        | "diagonalFront"
        | "crossBody"
        | "unknown";

    confidence: number;
    source: CanonicalSource;

    debug: {
        sideScore: number;
        forwardScore: number;
        borderRisk: number;
        boneLengthWeight: number;
        extensionPenalty: number;
        temporalInnovation?: number;
    };
};

export type CanonicalHandState = {
    side: CanonicalSide;

    wristOrientation?: {
        palmRightBody: Vec3Like;
        palmUpBody: Vec3Like;
        palmNormalBody: Vec3Like;
        rollRad?: number;
        rollInfluence: number; // 0..1, 初期値は 0.25..0.60 程度
        confidence: number;
    };

    fingers: {
        thumb: FingerCanonicalState;
        index: FingerCanonicalState;
        middle: FingerCanonicalState;
        ring: FingerCanonicalState;
        little: FingerCanonicalState;
    };

    gestureHint?: {
        label:
            | "Open_Palm"
            | "Closed_Fist"
            | "Pointing_Up"
            | "Thumb_Up"
            | "Victory"
            | "Unknown";
        confidence: number;
        stableMs: number;
    };

    confidence: number;
    source: CanonicalSource;
};

export type FingerCanonicalState = {
    curl: number; // 0 open, 1 closed
    splay?: number; // -1..1, 必要最小限
    oppose?: number; // thumb 用
    confidence: number;
};

export type CanonicalReliability = {
    torso: number;
    head: number;
    leftArm: number;
    rightArm: number;
    leftHand: number;
    rightHand: number;
    joints: Partial<Record<string, number>>;
};

export type CalibrationSnapshot = {
    calibrationId: string;
    ageMs: number;
    neutralYawRad: number;
    shoulderWidth: number;
    torsoHeight: number;
    armLength: {
        left: { upper: number; lower: number };
        right: { upper: number; lower: number };
    };
    handScale?: {
        left: number;
        right: number;
    };
};

export type CanonicalUpperBodyState = {
    frame: CanonicalFrameInfo;
    meta: CanonicalCoordinateMeta;

    torso: CanonicalTorsoFrame;
    head: CanonicalHeadState;

    arms: {
        left: CanonicalArmState;
        right: CanonicalArmState;
    };

    hands: {
        left?: CanonicalHandState;
        right?: CanonicalHandState;
    };

    reliability: CanonicalReliability;
    calibration: CalibrationSnapshot;

    debug: {
        warnings: CanonicalWarning[];
        sourceSummary: Record<CanonicalSource, number>;
        outOfRangeFields: string[];
    };
};

export type CanonicalWarning =
    | "LOW_TORSO_CONFIDENCE"
    | "BODY_FRONT_FLIP_REJECTED"
    | "LEFT_RIGHT_SWAP_SUSPECTED"
    | "ARM_EXTENDED_POLE_UNRELIABLE"
    | "WRIST_NEAR_BORDER"
    | "HAND_DROPOUT"
    | "FACE_DROPOUT"
    | "RECOVERY_BLEND_ACTIVE";
```

この型のポイントは、`THREE.Vector3` や `THREE.Quaternion` を直接保存形式にしないことです。replay log や debug snapshot では JSON 化しやすい tuple を保存し、実行時 adapter で `THREE` 型へ戻します。

---

## 7. FrameClock / camera metadata

`CanonicalUpperBodyState` は時間差分を持つ状態推定の入力なので、`timestampMs` は描画フレームではなく video frame に紐づけます。`HTMLVideoElement.requestVideoFrameCallback()` は新しい video frame が compositor に送られるタイミングで callback を呼び、`mediaTime`、`presentationTime`、`presentedFrames`、`width`、`height` などの metadata を提供します。`presentedFrames` は callback 間で frame が欠落したかの検出にも使えます。([MDNウェブドキュメント][12])

また、`getUserMedia` constraints で指定した解像度・fps が実際に使われるとは限らないため、`MediaStreamTrack.getSettings()` で現在の track 設定を debug snapshot に保存します。MDN でも、`getSettings()` は現在の constrainable properties の実値を返すと説明されています。([MDNウェブドキュメント][13])

推奨保存項目です。

```ts
type CanonicalDebugFrameClock = {
    frameId: number;
    mediaTimeMs: number;
    presentationTimeMs?: number;
    presentedFrames?: number;
    droppedFrameEstimate?: number;
    videoWidth: number;
    videoHeight: number;
    trackSettings?: MediaTrackSettings;
};
```

---

## 8. debug 表示と metrics

添付 09 では、`motion-debug` で canonical 値、値域外、急変、左右入れ替え、metrics、replay log 保存値を確認できる必要があるとされています。 既存 roadmap でも、最初に作るべきものはアルゴリズム改善ではなく、MediaPipe snapshot、retarget frame、final pose、video metadata の保存と replay mode、neutral jitter / elbow flip / recovery jump / angular velocity spike / reach clamp occupancy の metrics です。

### 8.1 motion-debug 表示

最低限、次を表示します。

| 表示                   | 内容                                                       |
| ---------------------- | ---------------------------------------------------------- |
| body frame axes        | `R/U/F` を 3D overlay または debug panel に表示            |
| torso values           | yaw / pitch / roll / confidence / source                   |
| arm canonical          | elevation / openness / forwardness / reach / elbowFlexion  |
| hand state             | palm normal / curl / splay / gestureHint                   |
| reliability            | joint / part heatmap                                       |
| warnings               | front flip reject、swap suspected、dropout、recovery       |
| source                 | pose / hand / face / previous / predicted / neutral の比率 |
| avatar mapping preview | canonical wrist target と avatar target の差分             |

### 8.2 metrics へ渡す値

| metric                      | 入力                                   |
| --------------------------- | -------------------------------------- |
| `torsoJitterRms`            | torso yaw/pitch/roll の高周波成分      |
| `headJitterRms`             | head local rotation の高周波成分       |
| `armAngularVelocitySpike`   | arm semantic / IK output の急変        |
| `elbowFlipCount`            | pole hint dot previous < 0 の回数      |
| `reachClampOccupancy`       | reach が clamp に張り付いた割合        |
| `wristRollSpike`            | wrist roll の frame 間差分             |
| `leftRightSwapSuspectCount` | handedness と Pose wrist の不整合      |
| `dropoutDurationMs`         | hand / face / pose part ごとの欠落時間 |
| `recoveryJumpMagnitude`     | Recovering 開始時の位置・角度ジャンプ  |
| `outOfRangeCount`           | canonical 値域違反                     |

### 8.3 replay log に保存するもの

保存すべきものと再計算でよいものを分けます。

| 保存する                         | 理由                       |
| -------------------------------- | -------------------------- |
| video metadata                   | frame 同期・欠落検証に必要 |
| raw MediaPipe outputs            | 後処理差分比較に必要       |
| ReliabilityMap                   | 調整前後比較に必要         |
| CanonicalUpperBodyState          | contract 回帰テストに必要  |
| calibration snapshot id / values | 再現性に必要               |
| final VRMPose summary            | downstream 差分比較に必要  |

| 再計算でよい                           | 理由                       |
| -------------------------------------- | -------------------------- |
| UI 用 CSS mirror                       | 表示都合                   |
| Three.js runtime object                | JSON 化不要                |
| 一時 Vector3 / Quaternion インスタンス | deterministic に再生成可能 |
| derived chart values                   | canonical から再計算可能   |

---

## 9. 後段 contract

### 9.1 TemporalStateEstimator への contract

TemporalStateEstimator は landmark 座標ではなく、canonical scalar / vector / quaternion を読むべきです。既存資料でも、フィルタは landmark 座標だけにかけず、raw landmarks → semantic measurements → canonical controls → state estimator → avatar motion intent → final bone rotations という複数段に分ける方針が示されています。

入力:

```ts
type TemporalInput = {
    canonical: CanonicalUpperBodyState;
    reliability: CanonicalReliability;
};
```

出力:

```ts
type TemporalCanonicalState = CanonicalUpperBodyState & {
    temporal: {
        torsoState: "Tracked" | "Suspect" | "Predicted" | "Lost" | "Recovering";
        leftArmState: TrackingState;
        rightArmState: TrackingState;
        leftHandState?: TrackingState;
        rightHandState?: TrackingState;
    };
};
```

### 9.2 IK への contract

IK は `CanonicalArmState` を直接読み、avatar profile で scale / compression / clamp した target を受け取ります。

```ts
type ArmIkCanonicalInput = {
    side: CanonicalSide;
    shoulderBody: Vec3Like;
    wristBody: Vec3Like;
    reach: number;
    elevationRad: number;
    openness: number;
    forwardness: number;
    elbowFlexionRad?: number;
    poleHintBody?: Vec3Like;
    confidence: number;
};
```

IK 層で MediaPipe landmark を再解釈してはいけません。`forwardness` や `openness` の意味が IK 層で変わると、debug / metrics / semantic motion と語彙が破綻します。

### 9.3 MotionIntent への contract

MotionIntent は canonical scalar と gestureHint を読むだけにします。

```ts
type MotionIntentInput = {
    arms: CanonicalUpperBodyState["arms"];
    hands: CanonicalUpperBodyState["hands"];
    reliability: CanonicalReliability;
};
```

判定対象は `tracking`、`wave`、`pointing`、`nearFace`、`lost` などです。Gesture Recognizer は補助であり、最終 gesture state は hysteresis / minimum duration を通した安定状態にします。

### 9.4 AvatarMotionProfile への contract

AvatarMotionProfile は canonical body units を avatar-local target へ変換します。VRM 1.0 では rest rotation や optional bone の有無により、同じ見た目の pose data でも値が変わります。VRM animation 仕様でも、rest rotation、non-required bones、`NormalizedLocalRotation` の中間形式を使った互換化の必要性が説明されています。([GitHub][14])

```ts
type AvatarMotionProfile = {
    shoulderWidthScale: number;
    torsoHeightScale: number;
    armReachScale: number;
    armDepthCompression: number;
    elbowOutwardBias: number;
    shoulderDamping: number;
    wristRollInfluence: number;
};
```

VRoid 系の小柄・大きな頭のモデルでは、奥行きを強く入れすぎると腕の伸び切り、顔めり込み、肩崩れが出やすいため、既存資料の通り `depthCompression = 0.45〜0.75`、初期値 `0.60` 程度から始めるのが安全です。

### 9.5 three-vrm への contract

three-vrm へ渡すのは最終 `VRMPose` です。`VRMHumanoid.setNormalizedPose()` は normalized human bones に指定 pose を適用し、各 transform は rest pose / T-pose からの local transform である必要があります。`VRMHumanoid.update()` は `autoUpdateHumanBones` が true の場合、normalized human bones の pose を raw human bones へ転送します。([Pixiv][10])

```text
CanonicalUpperBodyState
  -> TemporalCanonicalState
  -> AvatarMotionProfile mapping
  -> IK / FK / Clip compose
  -> FinalUpperBodyPose { VRMPose, confidence, debug }
  -> vrm.humanoid.setNormalizedPose(pose)
  -> vrm.update(delta)
```

three-vrm の GitHub README でも `@pixiv/three-vrm` は Three.js 上で VRM を扱うパッケージであり、VRM loader plugin を GLTFLoader に登録して VRM instance を取得する構成が示されています。2026-06-14 時点で GitHub 上の latest release は v3.5.3 です。([GitHub][15])

---

## 10. 実装配置案

現行構成を活かすなら、次のように置くのが自然です。

```text
src/features/gaze/
  trackingRuntime/
    FrameClock.ts
    CameraQuality.ts
  poseTracking/
    PoseObservationAdapter.ts
  faceTracking/
    FaceObservationAdapter.ts

src/character/canonical/
  CanonicalUpperBodyState.ts
  CanonicalCoordinateSystem.ts
  TorsoFrameEstimator.ts
  CanonicalArmEstimator.ts
  CanonicalHandEstimator.ts
  CanonicalReliabilityAdapter.ts
  CanonicalDebugSnapshot.ts

src/character/retargeting/
  CanonicalToAvatarTargets.ts
  AvatarMotionProfile.ts

src/character/ik/
  ArmIkCanonicalInput.ts
  ... existing sincroArmIk*

src/pages/motionDebug/
  CanonicalStatePanel.tsx
  CanonicalReplayPanel.tsx
  CanonicalMetricsPanel.tsx
```

既存の `src/character/ik` には `sincroArmIkSolver.ts`、`sincroArmIkPole.ts`、`sincroArmIkTypes.ts` などがあり、`src/character/retargeting` には `sincroPoseRetargetFrame.ts`、`sincroPoseArmRetargeter.ts`、`sincroPoseRetargetUpperBody.ts` などが存在します。([GitHub][16]) したがって、Canonical 層は「既存 IK / retargeter を捨てる」ためではなく、**既存 retarget frame の上流に安定した意味量 contract を追加する**ために導入します。

---

## 11. 推奨実装順序

1. **型と debug snapshot を先に固定**
   `CanonicalUpperBodyState`、`CanonicalArmState`、`CanonicalHandState`、`CanonicalReliability` を追加し、`motionDebug` に JSON 表示と折れ線表示を出します。

2. **FrameClock / CameraQuality を統合**
   `requestVideoFrameCallback()` の `mediaTime` / `presentedFrames` と `getSettings()` を debug log に保存します。([MDNウェブドキュメント][12])

3. **TorsoFrameEstimator を実装**
   shoulder / hip / face / previous の fallback を持つ `R/U/F` 推定を作り、front flip reject を metrics 化します。

4. **CanonicalArmEstimator を実装**
   `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification` を出し、既存 IK へ渡します。

5. **Hand / Face の入力優先順位を固定**
   head は Face matrix 主入力、wrist position は Pose wrist 主入力、wrist orientation / fingers は Hand 主入力にします。

6. **TemporalStateEstimator と接続**
   `Tracked / Suspect / Predicted / Lost / Recovering` を canonical part ごとに持たせます。既存資料では、信頼度低下後 2〜3 frames で Suspect、200ms 復帰なしで Predicted、700ms 復帰なしで Lost、再検出後 200〜500ms blend で Recovering とする状態遷移が提案されています。

7. **AvatarMotionProfile で VRoid 差分を吸収**
   reach scale、depth compression、shoulder damping、wrist roll influence を profile 化します。roadmap でも、VRM load 時に rest local rotation、bone length、shoulder width、head size、optional bones を計測し、profile に reach scale / depth compression / elbow outward bias などを持たせる方針が示されています。

---

## 12. 最終提案

`CanonicalUpperBodyState` の設計原則は次の 6 点に集約できます。

1. **座標ではなく意味量を contract にする**
   `wrist.x/y/z` ではなく、`reach / elevation / openness / forwardness / elbowFlexion` を共有語彙にする。

2. **BodyLocalSpace を唯一の canonical 空間にする**
   image space、MediaPipe world、camera space、avatar local、VRM local を混ぜない。

3. **Pose / Hand / Face の役割を固定する**
   Pose は体幹・腕位置、Hand は palm / fingers、Face は head orientation と torso yaw 補助。

4. **world z は弱く使う**
   `forwardness` の補助には使うが、avatar wrist target へ直結しない。

5. **debug / replay / metrics を first-class にする**
   Canonical 値、reliability、source、warning、out-of-range を保存し、同じ入力で同じ結果を再現できるようにする。

6. **VRM 適用は normalized local pose に集約する**
   Canonical 層では VRM bone を触らず、最終的に `VRMPose` を構築して `vrm.humanoid.setNormalizedPose()` に渡す。

この方針により、IK、TemporalStateEstimator、MotionIntent、AvatarMotionProfile、three-vrm 適用層が同じ単位・同じ名前・同じ信頼度を読むようになり、後続のキャラクターらしい自然な動作、欠落復帰、VRoid 体型差吸収、metrics 改善が一貫して進められます。

[1]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend "Sincromisor/sincromisor-frontend at main · Sincromisor/Sincromisor · GitHub"
[2]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/package.json "raw.githubusercontent.com"
[3]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src "Sincromisor/sincromisor-frontend/src at main · Sincromisor/Sincromisor · GitHub"
[4]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character "Sincromisor/sincromisor-frontend/src/character at main · Sincromisor/Sincromisor · GitHub"
[5]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/pages "Sincromisor/sincromisor-frontend/src/pages at main · Sincromisor/Sincromisor · GitHub"
[6]: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[7]: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google for Developers"
[8]: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js "Face landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[9]: https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js "Gesture recognition guide for Web  |  Google AI Edge  |  Google for Developers"
[10]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[11]: https://research.google/blog/mediapipe-holistic-simultaneous-face-hand-and-pose-prediction-on-device/ "MediaPipe Holistic — Simultaneous Face, Hand and Pose Prediction, on Device"
[12]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback "HTMLVideoElement: requestVideoFrameCallback() method - Web APIs | MDN"
[13]: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings "MediaStreamTrack: getSettings() method - Web APIs | MDN"
[14]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md "vrm-specification/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md at master · vrm-c/vrm-specification · GitHub"
[15]: https://github.com/pixiv/three-vrm "GitHub - pixiv/three-vrm: Use VRM on Three.js · GitHub"
[16]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character/ik "Sincromisor/sincromisor-frontend/src/character/ik at main · Sincromisor/Sincromisor · GitHub"
