# 調査レポート：Sincromisor `sincro` モード向け評価基盤 / デバッグ / QA 設計

対象: `sincromisor-frontend` キャラクターアニメーション実装
主題: `07-evaluation-debug-qa.md` に基づく、記録・再生・metrics・固定テスト・QA 基盤の設計

## 0. 結論

`07-evaluation-debug-qa.md` の要求は、単なるデバッグ画面の拡張ではなく、**ライブカメラ依存の主観調整から脱却し、同一入力ログを同一 pipeline に再投入して、改善・悪化を比較できる “motion evaluation harness” を作ること**です。添付資料でも、目的は `sincro` モードの上半身キャラクターモーションについて、記録、再生、metrics、固定テストモーション、QA 観点を設計することと明記されています。

最初に実装すべきものは、IK、フィルタ、ROI、ジェスチャー改善ではなく、次の4点です。

1. `MotionDebugRecorder`: MediaPipe raw result、video metadata、camera settings、pipeline config、avatar profile、final pose を時系列保存する。
2. `MotionReplayPlayer`: ライブカメラなしで同じログを replay し、同じ pipeline を再実行できるようにする。
3. `MotionMetrics`: neutral jitter、elbow flip、recovery jump、angular velocity spike、reach clamp occupancy などを自動計算する。
4. `MotionQA`: 固定テストモーションと主観評価フォームを紐付け、数値では拾えない「かわいい / 自然 / 破綻しない」を評価する。

既存ロードマップでも Phase 1 は「記録・再生・評価基盤」であり、`motion-debug` で MediaPipe snapshot、retarget frame、final pose、video metadata を保存し、同じ debug log を replay mode に再入力し、主要 metrics を確認できることが完了条件になっています。

---

## 1. 現状コードの確認

公開リポジトリ上では、`sincromisor-frontend/src/pages/motionDebug` に `motionDebugApp.ts`、`motionDebugCameraStream.ts`、`motionDebugFrameCapture.ts`、`motionDebugVideoSource.ts`、`poseOverlayRenderer.ts`、`types.ts` などがあり、既に `motion-debug` ページは評価基盤の足場として使えます。([GitHub][1])

`package.json` では、`@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、`vite`、`vitest`、`zod` などが利用されています。つまり、MediaPipe result の型付き保存、VRM pose の serialized log、Vitest による metrics 回帰テスト、Zod による log schema validation を組み合わせる構成が自然です。([GitHub][2])

現在の `motionDebug` の snapshot 型は、camera、pose、tracker、poseRetarget、poseRetargetRuntime、render などの現在状態を返す構造を持っています。一方で、現状の `captureFrame` は video と overlay canvas を PNG data URL として保存する用途が中心で、フレームごとの構造化 motion log とは別物です。([GitHub][3]) ([GitHub][4])

`motionDebugApp.ts` には `loadVideoFixture` があり、fixture video を読み込む経路が既に存在します。また、`TrackerRuntime` と VRM scene、pose callback、face callback を接続する構造もあります。したがって、最初から別アプリを作るのではなく、既存 `motion-debug` を拡張し、`MotionDebugRecorder`、`MotionReplayPlayer`、`MotionMetrics` を追加する方針が妥当です。([GitHub][5])

一方、現在の camera stream 取得は `getUserMedia` で 1280x720 ideal / facingMode user を指定していますが、実際の `MediaStreamTrack.getSettings()` を評価ログに保存する設計にはまだ見えません。Web カメラでは要求値と実設定が一致するとは限らないため、camera settings は必須ログ項目です。([GitHub][6])

---

## 2. 評価基盤の基本方針

既存ロードマップの基本方針は、MediaPipe landmark をそのまま VRM bone に流さず、`MediaPipe observations → ReliabilityMap → Body-local canonical state → Temporal state → Motion intent → Avatar profile → IK/FK/additive animation → VRM normalized local rotations` へ段階的に変換することです。

評価基盤も同じ分解に合わせます。つまり、単に最終 VRM pose だけを保存するのではなく、**どの層で悪化したかを切り分けられる log schema** にします。

```text
Camera / Video Frame
  -> MediaPipe raw result
  -> ReliabilityMap
  -> CanonicalUpperBodyState
  -> TemporalState
  -> MotionIntent
  -> AvatarMotionProfile mapping
  -> IK / constraint / retarget snapshot
  -> final VRMPose
  -> applied normalized/raw pose
  -> frame metrics
```

MediaPipe の Web Landmarker は video mode で timestamp 付きの `detectForVideo()` 系処理を行いますが、公式ドキュメントではこれらの呼び出しが同期実行で UI thread をブロックするため、必要に応じて Web Worker に分離できると説明されています。これは性能だけでなく、推論タイミングの揺れを抑える意味でも評価ログに影響します。([Google for Developers][7]) ([Google for Developers][8])

---

## 3. Motion debug log schema

### 3.1 推奨ログ形式

最初の実装では、**NDJSON + gzip/Brotli** を推奨します。1行目に manifest、以降に frame record を並べる形式です。理由は、巨大ログでも streaming 保存・部分読み込み・差分比較がしやすく、ブラウザ内でも扱いやすいためです。

```ts
type SincroMotionDebugLogManifest = {
    schemaVersion: "sincro.motion-debug-log.v1";
    createdAtIso: string;

    source: {
        kind: "live-camera" | "video-fixture" | "synthetic";
        fixtureId?: string;
        videoHash?: string;
    };

    environment: {
        userAgent: string;
        devicePixelRatio: number;
        viewport: { width: number; height: number };
        timeOriginMs?: number;
    };

    build: {
        appVersion?: string;
        gitCommit?: string;
        packageVersions: {
            three?: string;
            threeVrm?: string;
            mediapipeTasksVision?: string;
        };
        configHash: string;
    };

    camera: {
        requestedConstraints?: MediaTrackConstraints;
        actualSettings?: MediaTrackSettings;
        facingMode?: string;
        frameWidth?: number;
        frameHeight?: number;
    };

    pipeline: {
        trackerConfig: unknown;
        reliabilityConfig: unknown;
        canonicalConfig: unknown;
        temporalConfig: unknown;
        retargetConfig: unknown;
        featureFlags: Record<string, boolean>;
    };

    avatar: {
        avatarProfileId: string;
        vrmMetaHash?: string;
        boneCapabilities: Record<string, boolean>;
        restMetrics: AvatarRestMetrics;
        motionProfile: AvatarMotionProfile;
    };

    metricSummary?: MotionMetricSummary;
};

type SincroMotionDebugFrame = {
    frameIndex: number;

    timestamp: {
        mediaTimeMs: number;
        presentationTimeMs?: number;
        expectedDisplayTimeMs?: number;
        receivedAtPerformanceMs?: number;
        presentedFrames?: number;
        deltaMediaMs?: number;
    };

    video: {
        width: number;
        height: number;
        readyState?: number;
        sourceFrameId?: number;
    };

    mediapipe?: {
        pose?: SerializedPoseLandmarkerResult;
        hands?: SerializedHandLandmarkerResult[];
        face?: SerializedFaceLandmarkerResult;
        gesture?: SerializedGestureRecognizerResult[];
    };

    reliability?: ReliabilityMap;
    canonical?: CanonicalUpperBodyState;
    temporal?: TemporalStateSnapshot;
    intent?: MotionIntent;

    solver?: {
        ik?: IkDebugSnapshot;
        targets?: RetargetTargetSnapshot;
        constraints?: ConstraintDebugSnapshot;
        clampedBones?: string[];
    };

    finalPose?: SerializedVrmPose;

    applied?: {
        normalizedPose?: SerializedVrmPose;
        rawPose?: SerializedVrmPose;
        angularVelocityDegPerSec?: Record<string, number>;
    };

    metrics?: MotionFrameMetrics;
};
```

### 3.2 必ず保存すべきデータ

| 層                                   |      必須度 | 保存理由                                                                  |
| ------------------------------------ | ----------: | ------------------------------------------------------------------------- |
| schema / build / package versions    |        必須 | 旧ログとの互換性、再現性、config 差分比較                                 |
| camera constraints / actual settings |        必須 | 解像度・fps・facingMode が品質に直結する                                  |
| video timestamp                      |        必須 | replay determinism、latency、drop frame 検出                              |
| MediaPipe raw result                 |        必須 | solver / reliability / canonical 改修を同一入力で比較するため             |
| ReliabilityMap                       |        推奨 | 悪い観測値をどの時点で弱めたかを検証するため                              |
| CanonicalUpperBodyState              |        推奨 | body-local 意味量の差分を見て、MediaPipe 依存と solver 依存を分離するため |
| TemporalState                        |        推奨 | Lost / Recovering / Predicted の状態遷移を検証するため                    |
| MotionIntent                         |        推奨 | wave / pointing / nearFace / lost などの意味づけの安定性を見るため        |
| IK / constraint snapshot             |        必須 | elbow flip、reach clamp、limit occupancy を説明するため                   |
| final VRMPose                        |        必須 | アルゴリズム出力差分を比較するため                                        |
| applied normalized pose              |        必須 | three-vrm 適用後の最終状態を metrics に使うため                           |
| raw pose                             | debug時のみ | normalized→raw 転送の検証用。常時保存は重い                               |

既存 report01 でも、動画そのものより MediaPipe の出力を保存して motion solver を調整しやすくする方針が示されており、`timestampMs`、pose landmarks、hand landmarks、handedness、face transform matrix などを記録する案が挙げられています。

### 3.3 保存しなくてもよい / 再計算できるデータ

常時保存しなくてよいものは、主に「決定的に再計算できる派生値」です。

| データ               | 方針                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| per-frame metrics    | summary 用には保存。詳細は raw / final pose から再計算可能                        |
| camera quality score | raw frame metadata と landmark から再計算可能。ただし UI 表示と一致させるなら保存 |
| segmentation mask    | 原則保存しない。保存するなら低解像度 mask summary、bbox 内平均値、hash 程度       |
| overlay PNG          | triage 用に任意保存。評価 log の主データにはしない                                |
| video frame image    | raw result replay では不要。video re-inference mode の fixture として別管理       |

ログサイズ削減では、float を 4〜5 桁程度に丸める、全 avatar profile を毎フレーム保存しない、segmentation mask を保存しない、hand/finger の欠落時は sparse にする、full snapshot を N フレームごとに置いて中間は delta encode する、という方針が有効です。

---

## 4. Timestamp と determinism

replay の基準時刻は `performance.now()` や `Date.now()` ではなく、**video frame に紐付く `mediaTimeMs`** にします。`requestVideoFrameCallback()` は video frame ごとの処理、canvas への描画、video analysis、外部音声との同期などに使える API で、callback には video frame の metadata が渡されます。([MDNウェブドキュメント][9])

記録すべき timestamp は次です。

| 項目                                  | 用途                                       |
| ------------------------------------- | ------------------------------------------ |
| `mediaTimeMs`                         | replay の正本時刻                          |
| `presentationTimeMs`                  | video frame が compositor に提出された時刻 |
| `expectedDisplayTimeMs`               | 表示予定時刻。遅延解析用                   |
| `presentedFrames`                     | drop / duplicate frame 検出                |
| `receivedAtPerformanceMs`             | pipeline 内処理時間の測定                  |
| `inferenceStartMs` / `inferenceEndMs` | MediaPipe 推論コスト測定                   |
| `deltaMediaMs`                        | filter / velocity / angular velocity 計算  |

また、MediaStream の要求 constraints だけでなく、実際の設定値は `MediaStreamTrack.getSettings()` で取得して保存します。MDN でも `getSettings()` は constrainable properties の現在値、つまり実際の構成を返す API とされています。([MDNウェブドキュメント][10])

---

## 5. Replay mode 設計

### 5.1 Mode A: MediaPipe raw result replay

最優先で作るべき mode です。

```text
recorded MediaPipe raw result
  -> ReliabilityEstimator
  -> Canonicalizer
  -> TemporalStateEstimator
  -> MotionIntentEstimator
  -> AvatarMotionProfile
  -> IK / Retarget
  -> final VRMPose
```

利点は、ログが比較的小さく、カメラなしで同じ入力を再利用でき、solver / temporal / retarget / avatar profile の改善を安定して比較できることです。制約は、MediaPipe 自体、ROI、カメラ画質、露出、motion blur の改善評価には使えないことです。

### 5.2 Mode B: video fixture re-inference

既存 `motionDebug` には `loadVideoFixture` 経路があり、fixture video を使った検証の足場があります。([GitHub][5])

この mode では、録画済み video fixture から MediaPipe を再実行します。

```text
video fixture
  -> MediaPipe Pose / Hand / Face / Gesture
  -> full pipeline
```

利点は、検出器設定、Hand/Face ROI、camera quality 評価の検証ができることです。制約は、MediaPipe 実行環境、ブラウザ、Worker、GPU/CPU 実装差により、完全 deterministic にはなりにくいことです。MediaPipe Hand Landmarker や Gesture Recognizer も video/live stream mode では tracking と detection の状態を持つため、raw result replay より揺れやすくなります。([Google for Developers][8]) ([Google for Developers][11])

### 5.3 Mode C: canonical state replay

CanonicalUpperBodyState から後段だけを再生する mode も価値があります。

```text
recorded CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> MotionIntentEstimator
  -> AvatarMotionProfile
  -> IK / Retarget
  -> final VRMPose
```

これは canonicalization より後ろの temporal / semantic / avatar / IK の評価に特化します。例えば、同じ `elevation / openness / forwardness / elbowFlexionHint` から、フィルタ係数や avatar profile の変更だけを比較する用途に向いています。

### 5.4 Mode D: final pose playback

`finalPose` または `appliedPose` だけを再生する mode は、アルゴリズム評価ではなく visual QA / regression preview 用です。

```text
recorded final VRMPose
  -> vrm.humanoid.setNormalizedPose()
  -> vrm.update(delta)
```

three-vrm では normalized pose を `setNormalizedPose()` で適用し、`VRM.update(delta)` で normalized rig から raw rig へ転送する設計が基本です。`setNormalizedPose()` に渡す transform は rest pose / T-pose からの local relative transform です。([Pixiv][12])

---

## 6. Metrics 定義

### 6.1 Quaternion angle 共通関数

最終 pose の metrics は Euler 角ではなく quaternion 差分で計算します。

```ts
function quatAngleDeg(a: QuaternionArray, b: QuaternionArray): number {
    const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    const clamped = Math.min(1, Math.max(-1, dot));
    return (2 * Math.acos(clamped) * 180) / Math.PI;
}

function angularVelocityDegPerSec(
    prev: QuaternionArray,
    next: QuaternionArray,
    dtSec: number,
): number {
    return quatAngleDeg(prev, next) / Math.max(dtSec, 1e-6);
}
```

three-vrm 側でも、最終 pose は `VRMHumanBoneName` ごとの normalized local rotation として扱うべきで、raw node の world quaternion を直接保存・上書きする方式は避けるべきです。

### 6.2 最初に見るべき metrics と合格ライン

| Metric                     | 計算方法                                                  |          合格 |      警告 |    失敗 |
| -------------------------- | --------------------------------------------------------- | ------------: | --------: | ------: |
| neutral jitter: torso/head | neutral 区間で基準 quaternion からの RMS                  |        ≤ 1.0° |  1.0–2.0° |  > 2.0° |
| neutral jitter: wrist      | neutral 区間で wrist / hand の RMS                        |        ≤ 3.0° |  3.0–5.0° |  > 5.0° |
| elbow flip count           | elbow pole が急反転した回数                               |             0 |         - |     ≥ 1 |
| dropout recovery jump      | Lost/Predicted から Recovering/Tracked 復帰時の最大角度差 |         ≤ 15° |    15–25° |   > 25° |
| added latency: hand/head   | raw feature と final pose feature の相互相関遅れ          |       ≤ 100ms | 100–150ms | > 150ms |
| added latency: torso       | 同上                                                      |       ≤ 150ms | 150–220ms | > 220ms |
| bone length variance       | 高信頼度時の上腕/前腕推定長 CV                            |          ≤ 8% |     8–12% |   > 12% |
| reach clamp occupancy      | reach clamp 発生 frame / valid frame                      |         ≤ 10% |    10–20% |   > 20% |
| left-right swap count      | side assignment が時系列整合を破った回数                  |             0 |         - |     ≥ 1 |
| semantic label flicker     | min duration 未満の gesture label 変化数                  | 0–1 / segment |       2–3 |     > 3 |

既存 report03 でも、最初に見るべき指標として neutral jitter、elbow flip count、dropout recovery jump、added latency、bone length variance が挙げられ、neutral jitter は torso/head RMS 0.5〜1.0°以下、wrist 2〜3°以下、elbow flip は固定テスト中 0 回、recovery jump は 10〜15°以下、reach clamp occupancy は 10〜20% を超えると問題の可能性が高い、とされています。

### 6.3 個別 metric の定義

**neutral jitter**

```text
neutralJitterRms(bone) =
  sqrt(mean(angle(q_frame, q_reference)^2))
```

`q_reference` は neutral 区間の quaternion median または低速平均です。胴体・頭は強く評価し、手首・指は許容量をやや広くします。

**elbow flip count**

```text
flip if angle(pole_t, pole_t-1) > 120°
  and armConfidence > threshold
  and wrist motion is not intentionally crossing
```

肘反転は 1 回でも視覚的に目立つため、固定テストでは 0 回を合格条件にします。

**dropout recovery jump**

```text
recoveryJump(side) =
  max angle(finalPose_lastPredicted, finalPose_firstRecovering..N)
```

Lost / Predicted 中に comfortable pose へ寄せる場合でも、復帰時に急に実測へ吸着してはいけません。

**angular velocity spike**

```text
spike if angularVelocityDegPerSec(bone) > threshold(bone)
```

閾値は部位別にします。胴体・頭の spike は厳しく、手・指は緩めにします。three-vrm 調査でも、MediaPipe landmark だけでなく final pose before/after limit、applied quaternion angular velocity、missing bone fallback、AnimationMixer ownership などを debug に出すべきとされています。

**reach clamp occupancy**

```text
reachClampOccupancy(side) =
  frames(clampRatio > 0 or clampedBones includes arm/shoulder) / validFrames
```

この値が高い場合、IK が悪いというより、user calibration、avatar arm scale、depth compression、target scale が悪い可能性が高いです。

**bone length variance**

```text
cv = std(observedBoneLength) / mean(observedBoneLength)
```

高信頼度 frame に限定して計算します。単眼推定の world z を過信している場合、この値が増えやすくなります。

**semantic label flicker**

```text
flicker = count(label changes that violate minDuration or hysteresis)
```

Gesture Recognizer は `Closed_Fist`、`Open_Palm`、`Pointing_Up`、`Thumb_Up`、`Victory` などのカテゴリを返せますが、ラベルを直接 animation trigger にするとちらつきやすいため、minimum duration と hysteresis を metrics 化します。([Google AI for Developers][13])

---

## 7. 固定テストモーションセット

### 7.1 最小セット

既存 report03 の固定テストセットを正本として、P0 / P1 に分けます。

| 優先度 | テスト                                         | 長さ目安 | 見るべき項目                                 |
| ------ | ---------------------------------------------- | -------: | -------------------------------------------- |
| P0     | neutral 10秒                                   |      10s | torso/head/wrist jitter、camera quality      |
| P0     | 片手をゆっくり上げる 左右                      |     各8s | shoulder 補正、elbow pole、腕の伸び切り      |
| P0     | 両手をゆっくり上げる                           |       8s | chest / upperChest 分配、肩崩れ              |
| P0     | 片手を画面外へ出して戻す                       |     各8s | Lost / Predicted / Recovering、recovery jump |
| P0     | 腕を交差する                                   |       8s | left-right swap、pole flip                   |
| P0     | 速い手振り                                     |       8s | latency、semantic wave、dropout              |
| P1     | 手を前に出す                                   |       8s | forwardness、depth compression               |
| P1     | 手を顔の前に置く                               |       8s | face/hand occlusion、wrist roll、指安定      |
| P1     | 指差し・開き手・握り手                         |      10s | finger curl、gesture state、semantic flicker |
| P1     | 顔を左右に向ける                               |       8s | Face/Pose fallback、head jitter              |
| P1     | 手を横に広げる                                 |       8s | openness、arm length correction              |
| P1     | 小柄 VRoid / upperChest なし VRM で同一 replay |        - | avatar profile、optional bone fallback       |

report01 でも、正面 neutral、ゆっくり手を上げる、高速手振り、手を顔の前に出す、片手を画面外に出す、腕を交差する、横を向く、手をカメラ方向に突き出す、小柄 VRoid、upperChest なしモデルがテストケースとして挙げられています。

### 7.2 収録条件

固定テストログは、次の条件を manifest に記録します。

| 条件     | 記録内容                                                                |
| -------- | ----------------------------------------------------------------------- |
| camera   | requested constraints、actual settings、resolution、fps、facingMode     |
| framing  | torso in frame、hands in frame、border risk                             |
| lighting | 明るい / 暗い / 逆光などのラベル                                        |
| actor    | 身長・体型そのものではなく、肩幅 calibration 値などの匿名化された計測値 |
| avatar   | default VRoid、小柄 VRoid、頭大きめ、upperChest なし                    |
| pipeline | MediaPipe config、filter config、retarget config、avatar profile hash   |
| fixture  | raw-result fixture / video fixture / canonical fixture の種別           |

`requestVideoFrameCallback()` と `getSettings()` をログに取り込む Phase 2 は、ロードマップでも明示されています。

---

## 8. QA 観点

### 8.1 主観評価フォーム

数値 metrics は必要ですが、最終目的は「人体忠実」ではなく「キャラクターとして自然で破綻しない」ことです。ロードマップでも、優先順位は「破綻しない」「安定している」「キャラクターとして自然に見える」「ユーザーの意図が伝わる」「実人体に忠実」の順とされています。

推奨フォームは 5 段階評価 + 破綻タグです。

| 項目                         | 評価               |
| ---------------------------- | ------------------ |
| 全体の安定感                 | 1–5                |
| キャラクターとして自然か     | 1–5                |
| かわいさ / 親しみやすさ      | 1–5                |
| ユーザーの動作意図が伝わるか | 1–5                |
| 胴体・頭の落ち着き           | 1–5                |
| 腕・肩の破綻の少なさ         | 1–5                |
| 手首・指の違和感の少なさ     | 1–5                |
| 遅延の許容感                 | 1–5                |
| 総合採用可否                 | pass / warn / fail |

### 8.2 破綻分類

| Severity | 分類   | 例                                                          |
| -------- | ------ | ----------------------------------------------------------- |
| S0       | 即修正 | 肘反転、左右入れ替え、肩が胴体へめり込む、頭が震える        |
| S1       | 高優先 | 手首 roll 暴れ、recovery jump、腕の伸び切り、顔前の手で破綻 |
| S2       | 中優先 | 指のちらつき、gesture label flicker、semantic clip 誤発火   |
| S3       | 低優先 | 小さな jitter、表現不足、動きが控えめすぎる                 |

report03 でも、かわいい / 自然に見せる上で避けるべき破綻は、胴体・頭部 jitter、肘反転、肩崩れ、手首 roll 暴れ、腕の伸び切り、指のちらつきの順に整理されています。

### 8.3 avatar 差分 QA

同じ replay log を複数 avatar に適用します。

| Avatar                              | 見るべき差分                                 |
| ----------------------------------- | -------------------------------------------- |
| 標準 VRoid                          | baseline                                     |
| 小柄 VRoid                          | reach scale、depth compression、腕の伸び切り |
| 頭大きめ VRoid                      | 手が顔に近い時のめり込み、head influence     |
| upperChest なし                     | chest / spine / shoulder 分配                |
| shoulder bone なし / 指 bone 不完全 | optional bone fallback                       |

ロードマップでも、VRM load 時に rest local rotation、bone length、shoulder width、head size、optional bones を計測し、小柄 VRoid、頭が大きいモデル、upperChest なしモデルで同じ replay log を比較できることが完了条件になっています。

### 8.4 camera quality 差分 QA

| Camera condition      | 見るべき問題                             |
| --------------------- | ---------------------------------------- |
| 1280x720 / 30fps 相当 | baseline                                 |
| 実 fps 低下           | added latency、dropout、temporal spike   |
| 暗所                  | hand dropout、motion blur risk           |
| 顔アップ              | 肩・肘が入らず torso frame が不安定      |
| 遠距離                | hand bbox 小、Hand dropout、gesture miss |
| 手が画面端            | border risk、recovery jump               |
| 腕交差 / 顔前         | left-right swap、occlusion               |

UX に出す場合は、内部 metrics ではなく「もう少し離れて両肩が入るようにしてください」「手が画面端に近いです」など、ユーザーが修正できる表現に変換します。report03 でも camera quality score を UX に反映する具体例が整理されています。

---

## 9. Metrics が改善しても見た目が悪化するケース

評価基盤では、metrics の単純最小化を避ける必要があります。

| 数値上の改善                | 起きうる見た目の悪化                                |
| --------------------------- | --------------------------------------------------- |
| jitter 低下                 | 動きが鈍い、生命感がない                            |
| angular velocity spike 減少 | 手振りや指差しの意図が弱い                          |
| reach clamp occupancy 低下  | target scale を下げすぎて腕が届かない               |
| semantic flicker 減少       | gesture が発火しにくく、表現が乏しい                |
| latency 低下                | フィルタ不足で jitter / snap が増える               |
| dropout を短く見せる        | 不確かな観測値に早く戻りすぎて recovery jump が出る |

したがって、CI / regression gate で見る metrics と、人間 QA で見る「自然さ」「かわいさ」「意図の伝達」は分けます。

---

## 10. 実装モジュール案

既存ロードマップは、現行の `features/gaze/trackingRuntime`、`features/gaze/poseTracking`、`character/retargeting`、`character/ik`、`pages/motionDebug` を足場として活かし、`MotionDebugRecorder` / `MotionReplayPlayer` / `MotionMetrics` を追加する方針です。

推奨追加構成は次です。

```text
src/mocap/evaluation/
  MotionDebugLogSchema.ts
  MotionDebugRecorder.ts
  MotionDebugLogWriter.ts
  MotionDebugLogReader.ts
  MotionReplayPlayer.ts
  MotionReplayClock.ts
  MotionMetrics.ts
  MotionMetricDefinitions.ts
  MotionComparisonReport.ts
  MotionQaTags.ts
```

または既存責務境界を崩さない場合は、次のように `features/gaze` と `pages/motionDebug` に寄せます。

```text
src/features/gaze/evaluation/
  MotionDebugRecorder.ts
  MotionReplayPlayer.ts
  MotionMetrics.ts

src/pages/motionDebug/
  motionDebugReplayPanel.ts
  motionDebugMetricsPanel.ts
  motionDebugComparisonPanel.ts
```

report02 でも、`src/mocap/evaluation/MotionDebugRecorder.ts`、`MotionReplayPlayer.ts`、`MotionMetrics.ts` のような分割が提案されており、Phase 1 は raw result recording、final pose recording、metrics dashboard、fixed test sequence から始めるべきとされています。

---

## 11. `motion-debug` UI 設計

### 11.1 Recorder panel

必要な操作は次です。

```text
[Start Recording]
[Stop Recording]
[Export Log]
[Export Summary]
[Capture Visual Frame]
```

表示項目:

- recording duration
- frame count
- dropped / duplicate frame count
- current camera settings
- current pipeline config hash
- avatar profile hash
- estimated log size
- current reliability summary

### 11.2 Replay panel

```text
[Load Log]
[Replay Baseline]
[Replay Candidate Config]
[Pause]
[Step Frame]
[Seek]
[Export Comparison]
```

比較 UI は次を表示します。

| UI               | 内容                                                           |
| ---------------- | -------------------------------------------------------------- |
| timeline         | dropout、flip、spike、swap、semantic flicker の event marker   |
| side-by-side VRM | baseline / candidate の同時再生                                |
| skeleton overlay | raw landmarks、canonical target、final bone                    |
| metrics diff     | pass / warn / fail と差分                                      |
| config diff      | filter / reliability / avatar profile / retarget config の差分 |
| frame inspector  | 特定 frame の MediaPipe / Reliability / IK / finalPose         |

### 11.3 QA panel

```text
[Mark Failure]
[Add QA Tag]
[Rate Naturalness]
[Rate Stability]
[Rate Intent]
[Save QA Review]
```

QA tag は、`elbow_flip`、`shoulder_collapse`、`wrist_roll_noise`、`left_right_swap`、`recovery_snap`、`gesture_flicker`、`too_stiff`、`too_laggy`、`not_cute` などを固定語彙にします。

---

## 12. Live 調整に頼らない改善サイクル

推奨する運用サイクルは次です。

```text
1. 固定テストモーションを収録
   -> raw result log / video fixture / avatar profile を保存

2. baseline metrics を生成
   -> summary JSON と visual replay を保存

3. パラメータ変更
   -> reliability / temporal / IK / avatar profile / semantic の config hash を変える

4. 同一ログで replay
   -> candidate metrics を生成

5. 自動 gate
   -> S0/S1 metrics が悪化していないか確認

6. side-by-side QA
   -> 数値で拾えない自然さ、かわいさ、意図伝達を確認

7. 合格した config を fixture と一緒に固定
   -> regression test に追加

8. 新しい失敗例を exploratory から regression へ昇格
```

重要なのは、探索的な live 調整を完全に禁止することではなく、**live で見つけた失敗を必ず fixture 化し、次回以降は replay と metrics で再検証できる状態にすること**です。

---

## 13. 実装順序

最短で価値が出る順序は次です。

| Phase | 実装                               | 完了条件                                                           |
| ----: | ---------------------------------- | ------------------------------------------------------------------ |
|     1 | log manifest + frame NDJSON export | MediaPipe raw result と finalPose を保存できる                     |
|     2 | replay from raw result             | ライブカメラなしで同じ finalPose を再生成できる                    |
|     3 | metrics summary                    | neutral jitter / elbow flip / recovery jump / reach clamp を出せる |
|     4 | fixed test fixtures                | P0 テストを同じ UI から再生・比較できる                            |
|     5 | side-by-side comparison UI         | baseline / candidate を同時比較できる                              |
|     6 | avatar profile matrix              | 小柄 VRoid / upperChest なしで同一ログ比較できる                   |
|     7 | QA form and tags                   | 主観評価を metrics と同じ report に保存できる                      |
|     8 | CI / regression integration        | fixture replay の summary が閾値を超えたら検出できる               |

この順序は、report03 の「記録・再生・デバッグ表示が最優先で、その後にキャリブレーション、信頼度、時系列、IK / retarget、avatar profile、semantic motion へ進む」という実装順と整合します。

---

## 14. 最終推奨

`07-evaluation-debug-qa.md` に対する実装方針は、次の一文に集約できます。

**`motion-debug` を、現在状態を見るページから、同一入力ログを保存・再生・比較・採点する評価基盤へ拡張する。**

最初の実装単位は次で十分です。

```text
MotionDebugRecorder
  - manifest + frame NDJSON
  - MediaPipe raw result
  - finalPose
  - camera settings
  - avatar profile
  - pipeline config hash

MotionReplayPlayer
  - raw result replay
  - fixed dt / mediaTime clock
  - baseline vs candidate replay

MotionMetrics
  - neutral jitter
  - elbow flip count
  - dropout recovery jump
  - angular velocity spike
  - reach clamp occupancy
  - left-right swap count
  - semantic label flicker

MotionQA
  - fixed test set
  - subjective score
  - failure tags
  - avatar / camera matrix
```

この基盤が先に入ると、以降の ReliabilityMap、TemporalStateEstimator、AvatarMotionProfile、Hand/Face ROI、semantic motion の改善が、主観ではなく同一ログ・同一 avatar・同一 metrics で比較できるようになります。

[1]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/pages/motionDebug "Sincromisor/sincromisor-frontend/src/pages/motionDebug at main · Sincromisor/Sincromisor · GitHub"
[2]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/package.json "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/pages/motionDebug/types.ts "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/pages/motionDebug/motionDebugFrameCapture.ts "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/pages/motionDebug/motionDebugCameraStream.ts "raw.githubusercontent.com"
[7]: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[8]: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google for Developers"
[9]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback "HTMLVideoElement: requestVideoFrameCallback() method - Web APIs | MDN"
[10]: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings "MediaStreamTrack: getSettings() method - Web APIs | MDN"
[11]: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js "Gesture recognition guide for Web  |  Google AI Edge  |  Google for Developers"
[12]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[13]: https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.gesturerecognizeroptions "GestureRecognizerOptions interface  |  Google AI Edge  |  Google for Developers"
