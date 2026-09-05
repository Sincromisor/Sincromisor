# CanonicalUpperBodyState / 座標系調査・設計レポート

対象: `sincromisor-frontend` / `sincro` モード / 単眼 Web カメラ + MediaPipe Pose・Hand・Face・Gesture + VRM 1.0 + Three.js + three-vrm
作成日: 2026-06-14

## 0. 結論

`CanonicalUpperBodyState` は、MediaPipe の特徴点を VRM ボーンへ渡す前の単なる座標変換層ではなく、**不確実な観測値を、IK・時系列推定・意味に基づく動作動作・AvatarMotionProfile が共有できる「体幹基準の意味量」へ変換する中核契約** として設計すべきです。添付 09 の依頼でも、`forwardness`、IK 目標、フィルタの単位、評価指標、AvatarMotionProfile の倍率が後段ごとにずれないように、`CanonicalUpperBodyState` を明確化することが目的とされています。

推奨する処理順は次です。

```text
カメラ / VideoFrame
  -> MediaPipe 観測値
  -> ReliabilityMap
  -> CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> MotionIntent
  -> AvatarMotionProfile
  -> IK / FK / クリップ合成
  -> VRM 正規化済みローカル姿勢
```

重要なのは、**`CanonicalUpperBodyState` には VRM ボーンの回転を入れない**ことです。ここでは「腕が上がっている」「体から開いている」「前に出している」「肘がどれだけ曲がっている」「手のひらがどちらを向いている」といった制御意味を定義し、実際の VRM ボーン分配は後段の AvatarMotionProfile / IK / VrmPoseApplier に任せます。既存取り組み計画でも、MediaPipe 出力を直接 VRM ボーンの回転に変換せず、信頼性 → 身体のローカル座標系での標準状態 → 時系列 → MotionIntent → アバターの調整情報 → IK/FK → VRM 正規化済みのローカル回転へ流す方針が正本になっています。

---

## 1. 調査対象と現状整理

### 1.1 リポジトリ現状

`Sincromisor/Sincromisor` は公開リポジトリで、`sincromisor-frontend` 配下には `public`、`src`、`package.json`、Vite / TypeScript 関連設定が存在します。([GitHub][1]) `package.json` 上は React 19、Three.js `^0.182.0`、`@mediapipe/tasks-vision` `^0.10.34`、`@pixiv/three-vrm` `^3.5.1` を利用する構成です。([GitHub][2])

`src` 配下は `app`、`character`、`features`、`pages`、`shared`、`styles` に分かれており、既存の責務境界を活かして中間層を追加できる構造です。([GitHub][3]) `src/character` には `ik`、`retargeting`、`vrmCharacter` などがあり、`src/features/gaze` には `faceTracking`、`poseTracking`、`trackingRuntime` が存在します。([GitHub][4]) さらに `src/pages` には `motionDebug` と `poseLandmarkerSpike` が存在するため、標準状態の可視化・再生・評価指標を載せる足場は既にあります。([GitHub][5])

したがって今回の実装方針は、完全に別の `src/mocap` へ置き換えるよりも、既存の `features/gaze/*`、`character/retargeting`、`character/ik`、`pages/motionDebug` に橋渡しする **`character/canonical` または `character/motion/canonical` 層** を追加するのが妥当です。添付取り組み計画も、既存の `trackingRuntime`、`poseTracking`、`character/retargeting`、`character/ik`、`pages/motionDebug` を足場として、中間層を太らせる方針を示しています。

### 1.2 MediaPipe 入力の事実関係

MediaPipe Pose Landmarker は、Web / JavaScript で人体特徴点を検出し、画像座標の身体姿勢特徴点と 3D ワールド座標を出力します。Pose の出力には 33 特徴点、`presence`、`visibility`、任意の領域分割マスクが含まれ、ワールド座標は「両腰中点を原点とするメートル単位の 3D 座標」と説明されています。([Google AI for Developers][6]) ただし、単眼推定の z は安定した絶対奥行きではないため、添付資料の方針どおり、左右・上下・相対方向を主に使い、奥行きは圧縮して補助量として扱うべきです。

Hand Landmarker は手の特徴点の画像座標、ワールド座標、左右判定を返し、映像 / 実時間のストリームモードでは手存在確率と追跡信頼度に応じて手のひら検出と追跡を切り替える仕様です。([Google AI for Developers][7]) そのため、アプリ側でも `Detected / Suspect / Predicted / Lost / Recovering` のような状態を持ち、左右判定を Hand の結果だけで確定しない設計が必要です。

Face Landmarker は顔メッシュの特徴点に加え、オプションでブレンドシェイプと顔の変換行列を返せます。`outputFacialTransformationMatrixes` は標準化した顔モデルから検出顔への変換行列を出力するオプションです。([Google AI for Developers][8]) 今回は表情・視線が主スコープではないため、Face は **頭部向きと体幹ヨー補助**に限定して使うのがよいです。

Gesture Recognizer はリアルタイムの手ジェスチャーと手の特徴点を返す Web 向けタスクで、認識結果には手の特徴点、ワールド座標の特徴点、左右判定、ジェスチャー分類が含まれます。([Google AI for Developers][9]) ただしジェスチャーは標準状態の主入力ではなく、後段の MotionIntent 補助として扱うべきです。

---

## 2. 座標系定義

### 2.1 空間を 5 層に分離する

`CanonicalUpperBodyState` の最大の役割は、MediaPipe の座標値と VRM のボーンのローカル回転を混同しないことです。添付 09 でも、画像 / MediaPipe ワールド座標 / カメラ / 身体のローカル座標系の / アバターのローカル座標系の / VRM 正規化済みローカル姿勢の責務分離が主要論点として挙げられています。

| 空間                     | 原点                     | 軸                       | 単位                 | 主な用途                                        | 注意                       |
| ------------------------ | ------------------------ | ------------------------ | -------------------- | ----------------------------------------------- | -------------------------- |
| `ImageSpace2D`           | 左上                     | x 右、y 下               | 0〜1 正規化          | 画面内位置、画面端にあるリスク、2D ジェスチャー | プレビュー鏡像と混同しない |
| `MediaPipeWorldSpace`    | Pose は両腰中点          | MediaPipe 定義           | Pose は m            | 相対方向、骨長整合性、z 補助                    | 絶対 3D として過信しない   |
| `CameraObservationSpace` | カメラ入力基準           | 実装内部で統一           | 任意 / 正規化前      | Pose / Hand / Face 統合                         | 外部には漏らさない         |
| `BodyLocalSpace`         | 体幹原点                 | `R`,`U`,`F`              | 身体寸法の倍率正規化 | CanonicalUpperBodyState                         | 後段契約の中心             |
| `AvatarControlSpace`     | アバター体幹 / 肩        | アバターの調整情報基準   | アバター比率         | IK 目標、演出補正                               | VRM ボーンの回転ではない   |
| `VRMNormalizedLocalPose` | 各人型骨格ボーン初期姿勢 | three-vrm 正規化済みリグ | クォータニオン       | `setNormalizedPose()`                           | 標準状態の後段             |

three-vrm の `VRMHumanoid.getNormalizedPose()` / `setNormalizedPose()` は、正規化済みの人型ボーンの現在姿勢を `VRMPose` として扱い、各変換は初期姿勢 / T-pose からのローカル変換です。`normalizedRestPose` は `setNormalizedPose()` / `getNormalizedPose()` と互換ではないと明記されているため、標準状態から最終 `VRMPose` を作る段階でも、毎フレーム「所有ボーンのローカル差分」を明示的に構築する必要があります。([Pixiv][10])

### 2.2 左右・鏡像の扱い

設計上の原則は、**標準状態の左 / 右は画面左・右ではなく、被写体の解剖学的左 / 右とする**ことです。自撮りプレビューを CSS で左右反転する場合でも、MediaPipe 入力や標準化した左右を反転させてはいけません。

推奨ルールは次です。

```text
displayMirror:
  UI プレビューだけの属性

anatomicalSide:
  "left" | "right"
  MediaPipe Pose の左・右特徴点と時系列整合性で確定

screenSide:
  デバッグ表示用
  プレビュー鏡像の有無で変わってよい
```

Hand Landmarker の左右判定は有用ですが、腕交差・顔前・画面端・再検出時に入れ替わる可能性があるため、Pose 手首との距離、前フレームの手 ID、左右連続性を併用して `anatomicalSide` に割り当てます。Google Research の Holistic 解説でも、Pose 予測を ROI 事前情報として使うことで速い動きへの反応と左右一貫性を高め、左・右手の混同を防ぐ設計が説明されています。([Google Research][11])

---

## 3. 体幹の座標系推定

### 3.1 基本式

体幹フレームは、腕・頭・手首・意味に基づく動作動作の共通基準です。基本は Pose の肩 / 腰から作ります。

```text
shoulderCenter = (leftShoulder + rightShoulder) / 2
hipCenter      = (leftHip + rightHip) / 2

U0 = normalize(shoulderCenter - hipCenter)        // body up
R0 = normalize(rightShoulder - leftShoulder)      // subject right
F0 = normalize(cross(R0, U0))                     // body front candidate
```

この式は既存 report01 / report03 でも共通して使われていますが、単眼推定では `F0` が反転しやすいため、Face 行列、前フレーム、カメラ前方を併用して安定化する必要があります。

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

推奨する代替処理順は次です。

| 優先 | 条件                      | 推定                                                 |
| ---: | ------------------------- | ---------------------------------------------------- |
|    1 | 肩 / 腰 / 顔が高信頼      | `U`,`R`,`F` を Pose + Face + 前フレームの値で推定    |
|    2 | 腰が弱いが肩 / 顔が高信頼 | `R` は肩、`U/F` は前フレームの値 + Face              |
|    3 | 肩が片側欠落              | 前フレーム `R` を保持し、Face ヨーと体幹中心だけ更新 |
|    4 | Face のみ                 | 頭部ヨーを体幹ヨーへ弱く混ぜる                       |
|    5 | 全体低信頼                | 前フレームの値から較正済み中立姿勢へ減衰             |

`bodyFront` は毎フレーム単純な `cross(R,U)` で決めないでください。次の制約を入れます。

```text
if dot(F_candidate, F_previous) < 0:
    F_candidate = -F_candidate  // または candidate weight を大幅低下

if angularChange(torsoYaw) > maxYawSpeed * dt:
    clamp yaw delta

if torsoReliability < 0.45:
    freeze or decay to neutral
```

### 3.3 継続的なキャリブレーション

継続的なキャリブレーションで更新してよいのは、**人間側の中立姿勢ヨー / 肩幅 / 画面内の構図倍率の低速推定**までです。VRM 初期姿勢の回転、任意ボーン方針、関節可動域、手のひらの基底軸定義は動的に変えてはいけません。

更新条件は厳しくします。

```text
torsoReliability > 0.85
headReliability  > 0.75
armMotionEnergy  < threshold
abs(torsoYawRate) < threshold
nearNeutralPose == true
duration > 500ms
```

更新係数は EMA で `alpha = 0.001〜0.005` 程度から始めます。初期較正は T 姿勢ではなく、「正面自然姿勢 + 軽い A 姿勢 + 手の中立姿勢」を 4〜6 秒程度で取得する方式が既存資料でも推奨されています。

---

## 4. 腕の標準化した意味量

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

| 値                | 型 / 値域     | 定義                                      | 用途                  |               |
| ----------------- | ------------- | ----------------------------------------- | --------------------- | ------------- |
| `side`            | `"left"       | "right"`                                  | 被写体の左右          | IK / 左右判定 |
| `reach`           | `0..1.15`     | `length(sw) / L_arm`                      | 到達距離制限 / 過伸展 |               |
| `elevationRad`    | `[-π/2, π/2]` | `asin(dot(normalize(mix(sw, upper)), U))` | 腕持ち上げ            |               |
| `openness`        | `[-1, 1]`     | `dot(normalize(sw), sideOut)`             | 横開き / 交差         |               |
| `forwardness`     | `0..1`        | 複合スコア                                | 前出し                |               |
| `elbowFlexionRad` | `[0, π]`      | `π - angle(s-e, w-e)`                     | 曲がる方向 / 伸展判定 |               |
| `armConfidence`   | `0..1`        | 関節信頼性合成                            | IK 重み / フィルタ    |               |
| `classification`  | 列挙値        | 左右 / 前 / 斜め / 不明                   | MotionIntent          |               |

`sideOut` は、`R` が被写体右方向の場合、右腕は `+R`、左腕は `-R` です。

### 4.2 `forwardness` の定義

単眼カメラではワールド座標のz 単独で「前に出している」と判定してはいけません。既存資料でも、ワールド座標 z は低〜中信頼の補助成分で、左右・上下・相対方向を主に使い、奥行きは圧縮して扱う方針になっています。

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

「前」と「横」の判定は単一閾値ではなく、ヒステリシスを持つ状態として扱います。既存 report03 の基準を初期値にするなら、横に広げる判定は `openness > 0.55 && forwardness < 0.35`、前に出す判定は `forwardness > 0.45 && openness < 0.55`、斜め前は両方が `0.35` を超えるケースです。前方向への入状態は `0.50`、抜け状態は `0.35` 程度にして、ちらつきを避けます。

### 4.3 信頼性反映

腕の信頼度は、単に MediaPipe の信頼度平均ではなく、次を合成します。

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

腕が伸び切っている場合、肘曲がる方向は実測値より前フレームの値 + 代替処理を優先します。既存資料では、`elbowFlexion < 15°` のときは曲がる方向を実測ではなく前フレームの値 + 代替処理優先にし、前フレームとの内積が負の場合や 60°/frame 以上の急変では測定済み曲がる方向の重みを大きく下げる方針が示されています。

---

## 5. 頭部 / 手首 / 手 / 指の入力優先順位

添付 09 の要求どおり、部位ごとに主入力と代替処理を固定します。

| 部位         | 主入力                        | 補助入力                       | 代替処理                  | 標準化したに保存するもの                     |
| ------------ | ----------------------------- | ------------------------------ | ------------------------- | -------------------------------------------- |
| 体幹         | Pose 肩 / 腰                  | Face ヨー、前フレームの値      | 較正済み中立姿勢          | `frame`, `yaw/pitch/roll`, `confidence`      |
| 頭部         | Face 変換行列                 | Pose 鼻 / 目 / 耳              | 前フレームの値 + 体幹     | `headLocal`, `yaw/pitch/roll`, `source`      |
| 手首位置     | Pose 手首                     | Pose 肘、Hand 手首切り出し中心 | 前フレームの値予測値      | `wristBody`, `reach`, `velocityHint`         |
| 手首向き     | Hand 手のひらの基底           | 前腕方向                       | 前フレームの値ロール減衰  | `palmNormal`, `palmForward`, `rollInfluence` |
| 指           | Hand 21 特徴点                | Gesture Recognizer             | 中立姿勢 / 前フレームの値 | `curl[5]`, `splay`, `thumbOppose`            |
| ジェスチャー | Gesture Recognizer / 自前分類 | 指状態                         | ヒステリシス保持          | `semanticHint`                               |

腕の位置は Pose 手首を主入力にし、Hand 特徴点は手首向き・手指・手存在確率の補助入力に限定します。これは、Hand Landmarker の切り出し内推定が全身座標と必ずしも整合しないためです。一方で Hand の 21 特徴点は手のひらの基底と指の曲げ / 指の開き / 対向運動の推定には有効です。

指は最初から各関節の 3D 回転を完全復元しない方が安定します。three-vrm 側の既存設計でも、Hand Landmarker の 21 点を直接指ボーンの回転に変換するのではなく、`curl`、`spread`、`oppose` のような低次元値に落とし、VRM の存在する指ボーンへ再分配する方針が推奨されています。

---

## 6. TypeScript 型案

実装コードそのものではなく、後段契約と単位が分かる設計型として定義します。

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

この型のポイントは、`THREE.Vector3` や `THREE.Quaternion` を直接保存形式にしないことです。再生ログや診断用スナップショットでは JSON 化しやすいタプルを保存し、実行時変換処理で `THREE` 型へ戻します。

---

## 7. FrameClock / カメラメタデータ

`CanonicalUpperBodyState` は時間差分を持つ状態推定の入力なので、`timestampMs` は描画フレームではなく映像フレームに紐づけます。`HTMLVideoElement.requestVideoFrameCallback()` は新しい映像フレームが画面合成処理に送られるタイミングでコールバックを呼び、`mediaTime`、`presentationTime`、`presentedFrames`、`width`、`height` などのメタデータを提供します。`presentedFrames` はコールバック間でフレームが欠落したかの検出にも使えます。([MDNウェブドキュメント][12])

また、`getUserMedia` 制約で指定した解像度・fps が実際に使われるとは限らないため、`MediaStreamTrack.getSettings()` で現在のトラック設定を診断用スナップショットに保存します。MDN でも、`getSettings()` は現在の制約を指定できる属性の実値を返すと説明されています。([MDNウェブドキュメント][13])

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

## 8. デバッグ表示と評価指標

添付 09 では、`motion-debug` で標準化した値、値域外、急変、左右入れ替え、評価指標、再生ログ保存値を確認できる必要があるとされています。 既存取り組み計画でも、最初に作るべきものはアルゴリズム改善ではなく、MediaPipe スナップショット、動作の変換フレーム、最終姿勢、映像メタデータの保存と再生モード、中立姿勢での細かな揺れ / 肘反転 / 復帰時の急変 / 角速度の急増 / 到達距離制限の発生率の評価指標です。

### 8.1 motion-debug 表示

最低限、次を表示します。

| 表示                       | 内容                                                      |
| -------------------------- | --------------------------------------------------------- |
| 身体の座標系軸             | `R/U/F` を 3D 重ね表示またはデバッグパネルに表示          |
| 体幹値                     | ヨー / ピッチ / ロール / 信頼度 / 入力元                  |
| 腕標準化した               | 仰角 / 開き具合 / 前出し具合 / 到達距離 / elbowFlexion    |
| 手状態                     | 手のひらの法線 / 曲げ / 指の開き / gestureHint            |
| 信頼性                     | 関節 / 部位ヒートマップ                                   |
| 警告                       | 前反転除外、入れ替え疑い、一時欠損、回復                  |
| 入力元                     | 姿勢 / 手 / 顔 / 前フレームの値 / 予測値 / 中立姿勢の比率 |
| アバター対応付けプレビュー | 標準化した手首目標とアバター目標の差分                    |

### 8.2 評価指標へ渡す値

| 評価指標                    | 入力                                            |
| --------------------------- | ----------------------------------------------- |
| `torsoJitterRms`            | 体幹ヨー・ピッチ・ロールの高周波成分            |
| `headJitterRms`             | 頭部ローカル回転の高周波成分                    |
| `armAngularVelocitySpike`   | 腕意味に基づく動作 / IK 出力の急変              |
| `elbowFlipCount`            | 曲がる方向手掛かり内積前フレームの値 < 0 の回数 |
| `reachClampOccupancy`       | 到達距離が値の制限に張り付いた割合              |
| `wristRollSpike`            | 手首ロールのフレーム間差分                      |
| `leftRightSwapSuspectCount` | 左右判定と Pose 手首の不整合                    |
| `dropoutDurationMs`         | 手 / 顔 / 姿勢部位ごとの欠落時間                |
| `recoveryJumpMagnitude`     | Recovering 開始時の位置・角度ジャンプ           |
| `outOfRangeCount`           | 標準化した値域違反                              |

### 8.3 再生ログに保存するもの

保存すべきものと再計算でよいものを分けます。

| 保存する                     | 理由                         |
| ---------------------------- | ---------------------------- |
| 映像メタデータ               | フレーム同期・欠落検証に必要 |
| 未加工 MediaPipe 出力        | 後処理差分比較に必要         |
| ReliabilityMap               | 調整前後比較に必要           |
| CanonicalUpperBodyState      | 契約回帰テストに必要         |
| 較正スナップショット ID / 値 | 再現性に必要                 |
| 最終 VRMPose 要約            | 下流差分比較に必要           |

| 再計算でよい                           | 理由                                   |
| -------------------------------------- | -------------------------------------- |
| UI 用 CSS 鏡像                         | 表示都合                               |
| Three.js 実行時オブジェクト            | JSON 化不要                            |
| 一時 Vector3 / Quaternion インスタンス | 同じ入力から同じ結果を得るに再生成可能 |
| 導出したグラフ値                       | 標準化したから再計算可能               |

---

## 9. 後段契約

### 9.1 TemporalStateEstimator への契約

TemporalStateEstimator は特徴点座標ではなく、標準化したスカラー / ベクトル / クォータニオンを読むべきです。既存資料でも、フィルタは特徴点座標だけにかけず、未加工の特徴点 → 意味に基づく動作測定値 → 標準化した操作部品 → 状態推定処理 → アバター動作意図 → 最終ボーン回転という複数段に分ける方針が示されています。

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

### 9.2 IK への契約

IK は `CanonicalArmState` を直接読み、アバターの調整情報で倍率 / 圧縮 / 値の制限した目標を受け取ります。

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

IK 層で MediaPipe 特徴点を再解釈してはいけません。`forwardness` や `openness` の意味が IK 層で変わると、デバッグ / 評価指標 / 意味に基づく動作動作と語彙が破綻します。

### 9.3 MotionIntent への契約

MotionIntent は標準化したスカラーと gestureHint を読むだけにします。

```ts
type MotionIntentInput = {
    arms: CanonicalUpperBodyState["arms"];
    hands: CanonicalUpperBodyState["hands"];
    reliability: CanonicalReliability;
};
```

判定対象は `tracking`、`wave`、`pointing`、`nearFace`、`lost` などです。Gesture Recognizer は補助であり、最終ジェスチャー状態はヒステリシス / 最小継続時間を通した安定状態にします。

### 9.4 AvatarMotionProfile への契約

AvatarMotionProfile は標準化した身体寸法を基準とする単位をアバターのローカル座標系の目標へ変換します。VRM 1.0 では初期姿勢の回転や任意ボーンの有無により、同じ見た目の姿勢データでも値が変わります。VRM アニメーション仕様でも、初期姿勢の回転、任意ボーン、`NormalizedLocalRotation` の中間形式を使った互換化の必要性が説明されています。([GitHub][14])

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

### 9.5 three-vrm への契約

three-vrm へ渡すのは最終 `VRMPose` です。`VRMHumanoid.setNormalizedPose()` は正規化済みの人型ボーンに指定姿勢を適用し、各変換は初期姿勢 / T-pose からのローカル変換である必要があります。`VRMHumanoid.update()` は `autoUpdateHumanBones` が true の場合、正規化済みの人型ボーンの姿勢を元の人型ボーンへ転送します。([Pixiv][10])

```text
CanonicalUpperBodyState
  -> TemporalCanonicalState
  -> AvatarMotionProfile mapping
  -> IK / FK / Clip compose
  -> FinalUpperBodyPose { VRMPose, confidence, debug }
  -> vrm.humanoid.setNormalizedPose(pose)
  -> vrm.update(delta)
```

three-vrm の GitHub README でも `@pixiv/three-vrm` は Three.js 上で VRM を扱うパッケージであり、VRM 読み込み処理プラグインを GLTFLoader に登録して VRM インスタンスを取得する構成が示されています。2026-06-14 時点で GitHub 上の最新リリースは v3.5.3 です。([GitHub][15])

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

既存の `src/character/ik` には `sincroArmIkSolver.ts`、`sincroArmIkPole.ts`、`sincroArmIkTypes.ts` などがあり、`src/character/retargeting` には `sincroPoseRetargetFrame.ts`、`sincroPoseArmRetargeter.ts`、`sincroPoseRetargetUpperBody.ts` などが存在します。([GitHub][16]) したがって、標準化した層は「既存 IK / 動作の変換処理を捨てる」ためではなく、**既存動作の変換フレームの上流に安定した意味量契約を追加する**ために導入します。

---

## 11. 推奨実装順序

1. **型と診断用スナップショットを先に固定**
   `CanonicalUpperBodyState`、`CanonicalArmState`、`CanonicalHandState`、`CanonicalReliability` を追加し、`motionDebug` に JSON 表示と折れ線表示を出します。

2. **FrameClock / CameraQuality を統合**
   `requestVideoFrameCallback()` の `mediaTime` / `presentedFrames` と `getSettings()` をデバッグログに保存します。([MDNウェブドキュメント][12])

3. **TorsoFrameEstimator を実装**
   肩 / 腰 / 顔 / 前フレームの値の代替処理を持つ `R/U/F` 推定を作り、前反転除外を評価指標化します。

4. **CanonicalArmEstimator を実装**
   `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification` を出し、既存 IK へ渡します。

5. **Hand / Face の入力優先順位を固定**
   頭部は Face 行列主入力、手首位置は Pose 手首主入力、手首向き / 指は Hand 主入力にします。

6. **TemporalStateEstimator と接続**
   `Tracked / Suspect / Predicted / Lost / Recovering` を標準化した部位ごとに持たせます。既存資料では、信頼度低下後 2〜3 フレームで Suspect、200ms 復帰なしで Predicted、700ms 復帰なしで Lost、再検出後 200〜500ms 合成で Recovering とする状態遷移が提案されています。

7. **AvatarMotionProfile で VRoid 差分を吸収**
   到達距離倍率、奥行き圧縮、肩減衰、手首ロール反映率を調整情報化します。取り組み計画でも、VRM 読み込み時に初期姿勢のローカル回転、骨の長さ、肩幅、頭部大きさ、任意ボーンを計測し、調整情報に到達距離倍率 / 奥行き圧縮 / 肘外向き偏りの補正などを持たせる方針が示されています。

---

## 12. 最終提案

`CanonicalUpperBodyState` の設計原則は次の 6 点に集約できます。

1. **座標ではなく意味量を契約にする**
   `wrist.x/y/z` ではなく、`reach / elevation / openness / forwardness / elbowFlexion` を共有語彙にする。

2. **BodyLocalSpace を唯一の標準化した空間にする**
   画像空間、MediaPipe ワールド座標、カメラ空間、アバターローカル、VRM ローカルを混ぜない。

3. **Pose / Hand / Face の役割を固定する**
   Pose は体幹・腕位置、Hand は手のひら / 指、Face は頭部向きと体幹ヨー補助。

4. **ワールド座標 z は弱く使う**
   `forwardness` の補助には使うが、アバター手首目標へ直結しない。

5. **デバッグ / 再生 / 評価指標を中核機能にする**
   標準化した値、信頼性、入力元、警告、値域外を保存し、同じ入力で同じ結果を再現できるようにする。

6. **VRM 適用は正規化済みローカル姿勢に集約する**
   標準化した層では VRM ボーンを触らず、最終的に `VRMPose` を構築して `vrm.humanoid.setNormalizedPose()` に渡す。

この方針により、IK、TemporalStateEstimator、MotionIntent、AvatarMotionProfile、three-vrm 適用層が同じ単位・同じ名前・同じ信頼度を読むようになり、後続のキャラクターらしい自然な動作、欠落復帰、VRoid 体型差吸収、評価指標改善が一貫して進められます。

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
