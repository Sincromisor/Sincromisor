# Sincromisor `sincro` モード キャラクターモーションデザイン調査レポート

調査対象: `sincromisor-frontend` / 添付 `04-character-motion-design.md`
対象範囲: 単眼Webカメラ + MediaPipe Pose / Hand / Face / Gesture + VRM 1.0 / VRoid Studio系モデル + Three.js / `@pixiv/three-vrm` による上半身同期

## 0. 結論

`sincro` モードのモーションデザインでは、**ユーザー姿勢の完全再現ではなく、「キャラクターがユーザーをまねている」と感じられる上半身の意図表現**を最適化対象にするべきです。添付依頼でも、対象は `chat` モードのidle、会話視線、表情、AI speech gestureではなく、`sincro` モードの上半身同期に限定されています。入力は MediaPipe Pose / Hand / Face / Gesture、出力は VRM 1.0 normalized pose と additive pose delta、対象はVRoid Studio系アニメ調モデルです。

最終方針は次の通りです。

```text
MediaPipe observations
  -> Reliability / CanonicalUpperBodyState / TemporalState
  -> MotionIntent
  -> tracking pose
  -> semantic additive clip
  -> fallback / comfort pose
  -> VrmPoseComposer
  -> vrm.humanoid.setNormalizedPose(finalPose)
  -> vrm.update(delta)
```

この設計では、MediaPipeのlandmarkを直接VRM boneへ流しません。既存ロードマップでも、MediaPipe landmarkは骨格姿勢の正解値ではなく不確実な観測値として扱い、reliability、canonical state、temporal estimation、motion intentを経てからIK / FK / animation clipとしてVRMへ適用する方針が正本化されています。

---

## 1. 現行リポジトリとの整合

公開リポジトリ上では、`sincromisor-frontend` は `src`、`public`、`package.json` などを持つフロントエンド構成です。([GitHub][1]) `package.json` では `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、React、Vite などが依存関係に含まれており、今回の調査前提と整合しています。([GitHub][2])

キャラクター制御の既存実装として、`src/character/retargeting` には `sincroPoseRetargeter.ts`、`sincroPoseArmRetargeter.ts`、`sincroPoseRetargetUpperBody.ts`、`sincroPoseArmIkSolve.ts` などがあり、Pose由来の上半身retargetと腕IKに関する実装境界がすでに存在します。([GitHub][3]) また、`src/character/ik` には `sincroArmIkSolver.ts`、`sincroArmIkPole.ts`、`sincroArmIkConstraint.ts`、`sincroArmIkGeometry.ts` などがあり、腕IKを独立した責務として扱える構成になっています。([GitHub][4])

したがって、今回の設計は既存コードを大規模に置き換えるより、既存の `retargeting` / `ik` の前段に `MotionIntent` と `SemanticMotionLayer` を追加し、後段に `VrmPoseComposer` を明確化する形が自然です。ロードマップでも、既存の `trackingRuntime`、`poseTracking`、`character/retargeting`、`character/ik`、`motionDebug` を活かしつつ、`ReliabilityMap`、`CanonicalUpperBodyState`、`TemporalStateEstimator`、`MotionIntent`、`AvatarMotionProfile` などを追加する方針が示されています。

---

## 2. Motion design principle

### 2.1 最適化順位

添付依頼では、優先順位は「破綻しない」「安定している」「キャラクターとして自然に見える」「ユーザーの意図が伝わる」「実人体の姿勢へ忠実」の順に置かれています。 これは妥当です。単眼Webカメラでは、奥行き、肘方向、手首roll、遮蔽、左右入れ替えが不安定になりやすく、完全追従を狙うほど破綻が目立ちます。

設計原則は次です。

| 原則                   | 内容                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| 大部位は安定優先       | 胴体、頭、肩は低振幅・低周波・強い平滑化を基本にする。                                       |
| 小部位は表現優先       | 手、指、短いgestureは、confidenceが高い場合にやや誇張してよい。                              |
| 追従より意図           | 手振り、指差し、サムズアップ、ピース、顔近くの手は、raw trackingではなくintent化して見せる。 |
| 低confidence時は縮退   | 動きを止めず、振幅を落としてcomfortable poseへ移る。                                         |
| clipは全身上書きしない | semantic clipはadditive補助とし、trackingと合成する。                                        |

既存レポートでも、かわいく自然に見せるうえで最も避けるべき破綻は、胴体・頭部jitter、肘反転、肩崩れ、手首roll暴れ、腕の伸び切り、指のちらつきの順とされています。大きい部位ほど安定、小さい部位ほど表現的に動かす設計が推奨されます。

### 2.2 アニメーション原則の取り込み

アニメーション設計では、anticipation、follow-through、ease in/out、arc、secondary action、exaggeration、appeal を限定的に使います。Adobeの12原則解説でも、anticipationは観客に動作を予期させ、follow-through / overlapping actionは停止後も一部が遅れて動くことで自然さを作り、ease in/outは加減速によって動きを自然に見せ、exaggerationは完全な写実よりも魅力を出すために使われると説明されています。([Adobe][5])

ただし、Sincromisorでは映画的な大きい演技ではなく、会話中の同期体験が前提です。したがって、適用は小さく限定します。

```text
anticipation:
  gesture clip開始前に肩・手首を50〜120msだけ先行させる

follow-through:
  手振り終了後に手首・指だけ100〜250ms遅れて収束

ease in/out:
  tracking <-> semantic <-> fallback の切替に必ず適用

exaggeration:
  指・手首・手先の軌道だけに限定し、肩・胸・頭には強く入れない
```

---

## 3. 「ものまねらしさ」の評価軸

`sincro` モードでは、全関節が正確に一致することよりも、ユーザーが「自分の動きをキャラが拾っている」と感じることが重要です。添付依頼でも、どの部位が似ていればものまねと感じやすいか、どの部位を省略・丸め・低振幅化できるかが主要論点として挙げられています。

### 3.1 似ている必要が高い部位

| 部位 / 状態      | 重要度 | 理由                                                                           |
| ---------------- | -----: | ------------------------------------------------------------------------------ |
| 手の高さ         |     高 | 手を上げた、顔の近くに持ってきた、胸前に出した、という意図が最も伝わりやすい。 |
| 手の左右位置     |     高 | 手振り、横へ広げる、片手だけ使う、両手を近づけるなどの印象に直結する。         |
| 手の開閉         |     高 | Open_Palm、Closed_Fist、Thumb_Up、Victoryなどのgesture identityに直結する。    |
| 頭のyaw          | 中〜高 | 顔の向きは「まねている」印象に効くが、揺れすぎると不安定に見える。             |
| 腕の大まかな角度 |     中 | 肘・前腕まで完全一致しなくても、手先位置と腕の方向が合えば意図は伝わる。       |
| 体幹の向き       |     中 | 全体の向きとして必要。ただし低振幅で十分。                                     |

### 3.2 丸めてよい部位

| 部位 / 成分          | 方針                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| 奥行き方向の手先位置 | 単眼推定では不安定なため、強く圧縮する。                                                                 |
| 手首roll             | 最も暴れやすいので25〜60%程度に抑える。既存資料でもroll成分は強く平滑化または前腕twistへ逃がす方針です。 |
| 肘pole               | 実測だけに寄せず、前フレーム・fallback pole・外側biasを混ぜる。                                          |
| 肩・胸               | clip側で大きく上書きしない。tracking寄りに保つ。                                                         |
| 指の各関節3D回転     | 単眼ではちらつきやすいため、curl中心にする。                                                             |

既存資料では、指制御は最初から各関節3D回転を狙わず、まず全指open/close、次に親指・人差し指・中指・薬指小指グループのcurlへ進めるのが安全とされています。

---

## 4. Semantic motion layer

### 4.1 役割

Semantic motion layerは、landmarkの揺れをそのまま見せる層ではなく、ユーザーの動作を「意味あるキャラクター動作」へ変換する層です。既存資料でも、semantic layerは「動作意図・ジェスチャー化」を担当し、人間っぽいがキャラとしてかわいくない動きを補正する層として位置づけられています。

MediaPipe Gesture Recognizerは、リアルタイムの手gesture認識結果と手landmarksを返します。公式ドキュメントでは、認識カテゴリとして `None`、`Closed_Fist`、`Open_Palm`、`Pointing_Up`、`Thumb_Down`、`Thumb_Up`、`Victory`、`ILoveYou` が挙げられており、hand landmarks、world landmarks、handedness、gesture categoriesを出力します。([Google AI for Developers][6])

ただし、Gesture Recognizerは主制御器ではなく、`MotionIntent` を決める補助入力として扱うべきです。Gesture RecognizerやHand LandmarkerのVideo modeでは、presence confidenceやtracking confidenceに応じてpalm detectionを再実行する設計があり、アプリ側でも「検出状態」を持つべきです。([Google AI for Developers][6])

### 4.2 MotionIntent一覧

基本intentは添付依頼の想定である `tracking`、`wave`、`pointing`、`nearFace`、`lost`、`fallback` を採用します。 追加すべきintentは、`thumbsUp`、`peace`、`explain`、`clapLike`、`guarded` です。

```ts
type ArmMotionIntent =
    | "tracking"
    | "wave"
    | "pointing"
    | "thumbsUp"
    | "peace"
    | "nearFace"
    | "explain"
    | "clapLike"
    | "guarded"
    | "lost"
    | "fallback";

type TorsoMotionIntent = "neutral" | "leaning" | "turning" | "settling";

type MotionIntentState = {
    leftArm: {
        intent: ArmMotionIntent;
        confidence: number;
        reliability: number;
        expressiveness: number;
        ageMs: number;
    };
    rightArm: {
        intent: ArmMotionIntent;
        confidence: number;
        reliability: number;
        expressiveness: number;
        ageMs: number;
    };
    torso: {
        intent: TorsoMotionIntent;
        confidence: number;
    };
};
```

### 4.3 Intent発火条件

基本条件は、既存資料にある通り、`gesture confidence > 0.70`、`hand reliability > 0.60`、条件継続150〜250ms、cooldown 300〜800ms を初期値にします。

| Intent     | 発火条件                                          | 補助条件                              | minimum duration |   cooldown |
| ---------- | ------------------------------------------------- | ------------------------------------- | ---------------: | ---------: |
| `tracking` | 明示gestureなし、pose/hand reliabilityが十分      | 通常状態                              |              0ms |        0ms |
| `wave`     | `Open_Palm` + 手が肩〜顔高さ + 左右速度の符号反転 | 0.5〜1.2秒内に2回以上の左右往復       |            400ms | 500〜800ms |
| `pointing` | `Pointing_Up` 継続                                | 人差し指curl低、他指curl高            |            200ms | 400〜700ms |
| `thumbsUp` | `Thumb_Up` 継続                                   | 手が胸前〜肩高さ                      |            200ms |      500ms |
| `peace`    | `Victory` 継続                                    | index/middle open、ringLittle curl    |            200ms |      500ms |
| `nearFace` | 手首またはpalm中心が顔bbox近傍                    | hand confidence低下時も200〜300ms保持 |            250ms |      300ms |
| `explain`  | Open_Palmまたはhalf-open + 片手が胸前             | 小さな左右/上下速度、会話中の説明姿勢 |            300ms |      400ms |
| `clapLike` | 両手距離が近い + 相対速度が対向                   | 実際の拍手音検出は不要。clipは控えめ  |            150ms |      800ms |
| `guarded`  | 両手が胴体前で交差/近接、左右同定が不安定         | 左右入れ替えを即反映しない            |            250ms |      500ms |
| `lost`     | hand reliability低下                              | Pose wristがあれば腕は継続            |            200ms |        0ms |
| `fallback` | pose/hand/face全体が低confidence                  | comfortable poseへ退避                |            300ms |        0ms |

手振りは `Open_Palm` だけで発火させないことが重要です。既存資料でも、手振りはOpenPalmだけでは誤発火しやすく、手が肩〜顔の高さにあり、左右速度の符号反転が0.5〜1.2秒内に2回以上ある条件を加えるとよいとされています。

---

## 5. Blend設計

### 5.1 基本ブレンド

Semantic clipは全身上書きではなく、tracking poseへのadditive補助にします。既存資料でも、短い上半身clipは常時上書きではなくadditive blendとして使い、状況に応じてtrackingとsemantic clipの比率を変える方針が示されています。

| 状況                        |   tracking | semantic clip | fallback / comfort | 備考                        |
| --------------------------- | ---------: | ------------: | -----------------: | --------------------------- |
| 通常tracking                | 0.85〜0.95 |    0.05〜0.15 |               0.00 | 微小な丸め・breathing程度。 |
| 軽い意図検出                | 0.70〜0.85 |    0.15〜0.30 |               0.00 | explain / nearFace初期。    |
| 指差し / ピース安定         | 0.60〜0.75 |    0.25〜0.40 |               0.00 | 手首・指はclip寄り。        |
| 手振り                      | 0.40〜0.70 |    0.30〜0.60 |               0.00 | 手先軌道をclipで安定化。    |
| tracking低下中のgesture継続 | 0.30〜0.50 |    0.50〜0.70 |         0.00〜0.20 | nearFace / wave維持。       |
| hand lost 200〜700ms        | 0.20〜0.40 |    0.00〜0.20 |         0.40〜0.70 | 腕はcomfortableへ。         |
| fallback                    | 0.00〜0.20 |          0.00 |         0.80〜1.00 | 動きを止めず自然姿勢へ。    |

### 5.2 部位別ブレンド

| 部位                       | tracking寄り | semantic寄り | fallback寄り | 方針                                 |
| -------------------------- | -----------: | -----------: | -----------: | ------------------------------------ |
| spine / chest / upperChest |           高 |           低 |           中 | 低振幅・安定優先。                   |
| neck / head                |           中 |           低 |           中 | head yawは追従、pitch/rollは控えめ。 |
| shoulder                   |           高 |           低 |           中 | clipで大きく上書きしない。           |
| upperArm                   |       中〜高 |           中 |           中 | 意図に応じて30%程度clip。            |
| lowerArm                   |           中 |       中〜高 |           中 | 指差し・手振りでclip寄り。           |
| wrist pitch/yaw            |           中 |       中〜高 |           中 | gesture印象に効く。                  |
| wrist roll                 |           低 |       低〜中 |           高 | 強く抑制。                           |
| fingers                    |           中 |           高 |           中 | semantic gesture時はclip寄り。       |

three-vrm適用では、Animation / IK / semantic / fallbackをそれぞれpose deltaとして出力し、`PoseComposer` で1つの `finalPose` に合成してから `setNormalizedPose(finalPose)` を1回だけ呼び、最後に `vrm.update(delta)` を呼ぶ設計にします。これは同じboneに複数の書き手を作らないためです。

three-vrmの `VRMHumanoid.getNormalizedPose()` / `setNormalizedPose()` は、各transformをrest pose / T-poseからのlocal transformとして扱うAPIです。`autoUpdateHumanBones` が有効な場合はnormalized human bonesからraw human bonesへ転送されるため、通常制御では `setNormalizedPose()` を主経路にするのが妥当です。([Pixiv][7])

---

## 6. Authored upper-body clip一覧

最初に用意すべきclipは、検出が不安定になりやすいがユーザー意図としては重要なものに限定します。添付依頼でも、手振り、指差し、サムズアップ、ピース、顔近くの手などのclip設計が期待成果物に含まれています。

| Clip                  | 対応Intent          |      長さ / 周期 | 主に触るbone                         | trackingに残すbone                    | 推奨weight |
| --------------------- | ------------------- | ---------------: | ------------------------------------ | ------------------------------------- | ---------: |
| `small_wave`          | `wave`              |   0.8〜1.2s loop | forearm, wrist, fingers              | torso, head, shoulder, upperArmの大枠 | 0.30〜0.60 |
| `point_forward_or_up` | `pointing`          | 0.35〜0.60s hold | wrist, index, other fingers, forearm | shoulder, upperArm, torso             | 0.25〜0.40 |
| `thumbs_up_hold`      | `thumbsUp`          |   0.4〜0.8s hold | thumb, wrist, fingers                | arm target, torso                     | 0.25〜0.45 |
| `peace_hold`          | `peace`             |   0.4〜0.8s hold | index, middle, ringLittle, wrist     | arm target, torso                     | 0.25〜0.45 |
| `shy_hand_near_face`  | `nearFace`          |   0.5〜1.0s hold | wrist, fingers, lowerArm             | head yaw, shoulder, torso             | 0.20〜0.40 |
| `explain_open_palm`   | `explain`           |   0.6〜1.2s loop | wrist, fingers, lowerArm             | upperArm, shoulder, torso             | 0.15〜0.30 |
| `soft_clap_like`      | `clapLike`          |        0.3〜0.6s | both wrists, fingers                 | shoulders, chest                      | 0.20〜0.35 |
| `lost_to_comfort`     | `lost` / `fallback` |        0.5〜0.9s | arm, wrist, fingers                  | head/torso low-frequency tracking     | 0.40〜1.00 |

ここで重要なのは、clipの「完全再生」を目的にしないことです。既存資料でも、`small_wave`、`point_up`、`thumbs_up`、`shy_hand_near_face`、`clap_like`、`explain_gesture` などを短い上半身clipとして用意し、tracking結果とadditive blendする方針が示されています。

---

## 7. Style parameters

`sincro` モードに閉じたstyle parameterは、キャラクターの性格全体ではなく、同期モーションの安全性とかわいさを調整するための低次元パラメータに限定します。

```ts
type SincroMotionStyle = {
    expressiveness: number; // 0.0 - 1.0 全体の表現量
    trackingFidelity: number; // 0.0 - 1.0 実写追従度
    semanticAssist: number; // 0.0 - 1.0 clip補助の強さ
    cutenessRoundness: number; // 0.0 - 1.0 軌道の丸め、ease強度
    gestureBoldness: number; // 0.0 - 1.0 gesture時の強調
    torsoDamping: number; // 0.0 - 1.0 胴体安定化
    headDamping: number; // 0.0 - 1.0 頭部安定化
    shoulderDamping: number; // 0.0 - 1.0 肩の抑制
    wristRollInfluence: number; // 0.25 - 0.60
    depthCompression: number; // 0.45 - 0.75
    lostMotionGraceMs: number; // 200 - 700
};
```

VRoid系の小柄・大きな頭のキャラクターでは、肩幅・腕の到達距離・奥行きを圧縮する必要があります。既存資料では、VRoid小柄モデル向けの例として `shoulderWidthScale: 0.85`、`upperArmScale: 0.92`、`lowerArmScale: 0.92`、`armDepthCompression: 0.6` が示され、単眼カメラのz方向は不安定なので奥行きを弱めるべきとされています。

---

## 8. 破綻時の自然な退避

### 8.1 confidenceに応じた振幅制御

低confidence時は即座にneutralへ戻さず、振幅を縮小してcomfortable poseへ移行します。既存資料でも、「控えめだが破綻しない」動きを優先し、最終的な設計原則として動きの大きさを信頼度に比例させる方針が示されています。

```ts
const confidenceAdjustedExpressiveness =
    smoothstep(0.25, 0.85, partReliability) * style.expressiveness;

motionAmplitude = baseAmplitude * confidenceAdjustedExpressiveness;
semanticWeight *= smoothstep(0.45, 0.75, gestureReliability);
trackingWeight *= smoothstep(0.3, 0.8, trackingReliability);
fallbackWeight = 1.0 - max(trackingWeight, semanticWeight);
```

### 8.2 手が消えた場合の部位別挙動

既存資料の推奨に合わせ、手が一時的に消えた場合は部位別に退避します。

|       時間 | 腕                                           | 肘pole                        | 手首                      | 指              | semantic       |
| ---------: | -------------------------------------------- | ----------------------------- | ------------------------- | --------------- | -------------- |
|   0〜200ms | Pose wristがあれば継続。なければ速度減衰予測 | 前フレーム保持 + fallback混合 | 直前姿勢保持              | 直前姿勢保持    | 200〜300ms保持 |
| 200〜700ms | comfortable poseへ戻す                       | fallback比率を上げる          | forearm-aligned neutralへ | 半開きneutralへ | fade out       |
|  700ms以降 | rest寄りに安定                               | fallback中心                  | neutral維持               | relaxed hand    | inactive       |

### 8.3 頭部欠落時

Face Landmarkerは3D face landmarks、blendshape scores、facial transformation matricesを出力できます。頭部姿勢ではFace matrixを主入力にし、Pose由来の鼻・目・耳はfallbackとして扱うのが妥当です。([Google AI for Developers][8]) Face Landmarkerのsmoothingは `numFaces` が1のときのみ適用されるため、`sincro` モードでは原則1人想定にするのが安全です。([Google AI for Developers][8])

既存資料でも、Pose fallbackはyaw補助中心とし、pitch / rollは弱く扱い、欠落時は頭を即neutralへ戻さずupperChest方向へ0.5〜1.0秒程度で戻すのが自然とされています。

---

## 9. MediaPipe / detection設計への示唆

### 9.1 Pose起点ROI

MediaPipe Pose Landmarkerは、画像または動画から身体landmarksを検出し、image coordinatesと3D world coordinatesを出力します。([Google AI for Developers][9]) Pose Landmarkerには `outputSegmentationMasks` などのオプションがあり、`detectForVideo()` は同期実行でUI threadをブロックするため、必要に応じてWeb Worker分離が推奨されます。([Google AI for Developers][9])

手・顔の安定化では、Poseを全体検出として使い、Pose wristやface regionからHand / Face ROIを作るのが有効です。Google ResearchのMediaPipe Holistic解説では、pose keypointsから左右の手と顔のROI cropを導出し、full-resolution frameから領域ごとのモデルへ渡すmulti-stage pipelineが説明されています。([Google Research][10]) また、pose predictionを毎フレームROI priorとして使うことで、速い動きへの応答と左右のsemantic consistencyを改善し、左右の手やbody partsの取り違えを防ぐ意図が説明されています。([Google Research][10])

### 9.2 FrameClock

`requestVideoFrameCallback()` は、新しいvideo frameがcompositorへ送られるタイミングでcallbackを実行し、`mediaTime`、`presentationTime`、`presentedFrames` などのmetadataを提供します。`presentedFrames` はcallback間でframeがmissされたかの検出に使えます。([MDN Web Docs][11]) MDNでは、video analysisやcanvas paintingなどのper-frame処理に有効で、`requestAnimationFrame()` と違ってvideo frame rateに合わせる性質があると説明されています。([MDN Web Docs][11])

したがって、Pose / Hand / Face / Gestureのtimestampは同一video frame基準で揃え、semantic gestureのminimum durationやcooldownもこのFrameClock上で扱います。

---

## 10. VRM pose合成規約

three-vrmへ渡すposeは、各boneのworld rotationではなく、normalized rest / T-poseからのlocal rotation deltaです。既存three-vrmレポートでも、Quaternionで扱い、毎フレーム正規化し、最終適用を `setNormalizedPose()` に集約する規約が示されています。

推奨モジュール構成は次です。

```text
MotionIntentEstimator
  -> SemanticClipLayer
  -> TrackingPoseLayer
  -> FallbackPoseLayer
  -> VrmPoseComposer
  -> VrmPoseApplier
```

```ts
type PoseLayer = {
    name: "tracking" | "semantic" | "fallback" | "style";
    pose: VRMPose;
    weight: number;
    mode: "override" | "additive";
    ownedBones: VRMHumanBoneName[];
};

type FinalUpperBodyPose = {
    pose: VRMPose;
    confidence: {
        torso: number;
        head: number;
        leftArm: number;
        rightArm: number;
        leftHand: number;
        rightHand: number;
    };
    debug: {
        activeIntents: string[];
        semanticWeights: Record<string, number>;
        clampedBones: VRMHumanBoneName[];
    };
};
```

`AnimationMixer` を本番VRMに直接当てる方式は、MediaPipe追従、IK、semantic clip、fallbackが同じboneを書き換える競合を起こしやすいため、長期的には `VRMPoseDelta` を自前保持するpose composer方式、またはstaging rigでclipを評価してposeを読む方式が安全です。 Three.jsの `AnimationMixer` 自体は、特定Object3D上のanimation playerとして提供されていますが、今回の用途では「主制御器」ではなく「clip評価器」として限定利用するのがよいです。([Three.js][12])

---

## 11. 主観評価チェックリスト

### 11.1 ものまねらしさ

| チェック              | 合格基準                                                            |
| --------------------- | ------------------------------------------------------------------- |
| 手を上げたとき        | キャラも同じ側の手を上げたと感じられる。                            |
| 手を振ったとき        | 手先の左右周期が見え、jitterではなくwaveに見える。                  |
| 指差し                | 指差し方向が完全一致しなくても、指差しgestureとして認識できる。     |
| サムズアップ / ピース | 指形状が1秒程度安定して見える。                                     |
| 顔近くの手            | 手が急に落ちず、顔近くの仕草として保持される。                      |
| 両手動作              | 左右入れ替えが一瞬起きても、見た目のsemantic continuityが保たれる。 |

### 11.2 会話中の邪魔にならなさ

| チェック       | 合格基準                                             |
| -------------- | ---------------------------------------------------- |
| neutral 10秒   | 胴体・頭が揺れて壊れて見えない。                     |
| 発話中の小動作 | 手の動きが発話内容への注意を奪わない。               |
| 大きな手振り   | 画面内で収まり、顔や胴体にめり込まない。             |
| tracking低下   | 急停止・急落下ではなく、自然に小さな動きへ縮退する。 |
| 長時間視聴     | 目が疲れるjitterや過剰な揺れがない。                 |

### 11.3 破綻チェック

既存ロードマップの破綻優先順位に従い、次を必須確認項目にします。

| 優先度 | 項目                | 観測方法                                    |
| -----: | ------------------- | ------------------------------------------- |
|      1 | 胴体・頭部jitter    | neutral 10秒の角速度spike                   |
|      2 | 肘反転              | elbow pole符号反転回数                      |
|      3 | 肩崩れ / 肩めり込み | 腕上げ時の肩・胸の変形確認                  |
|      4 | 手首roll暴れ        | wrist roll角速度、手の見た目                |
|      5 | 腕の伸び切り        | reach clamp occupancy                       |
|      6 | 指のちらつき        | gesture label flicker、finger curl variance |
|      7 | 左右入れ替え        | handedness swap count                       |
|      8 | 再検出ジャンプ      | dropout recovery jump                       |

---

## 12. 実装ロードマップ

### Phase A: MotionIntent基盤

1. `MotionIntentEstimator` を追加する。
2. Gesture Recognizerの結果を直接boneへ使わず、semantic labelとして読む。
3. `tracking / wave / pointing / thumbsUp / peace / nearFace / explain / clapLike / guarded / lost / fallback` を状態機械として扱う。
4. hysteresis、minimum duration、cooldownをFrameClock基準で実装する。

### Phase B: SemanticClipLayer

1. `VRMPoseDelta` 形式で短い上半身clipを定義する。
2. `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`lost_to_comfort` から作る。
3. clipは肩・胸・頭を強く上書きせず、主にforearm、wrist、fingersに効かせる。

### Phase C: VrmPoseComposer

1. tracking pose、semantic pose delta、fallback pose、style clampを1箇所で合成する。
2. Quaternionはslerpまたはlog-space blendで合成する。
3. 所有boneは毎フレーム必ず出力する。
4. `vrm.humanoid.setNormalizedPose(finalPose)` と `vrm.update(delta)` を最終段に集約する。

### Phase D: fallback / comfort pose

1. confidence低下時の振幅縮小を導入する。
2. hand lost時の0〜200ms、200〜700ms、700ms以降の部位別挙動を実装する。
3. head lost時はupperChest方向へ0.5〜1.0秒で戻す。
4. `lost_to_comfort` clipで「追従していない」ことを目立たせない。

### Phase E: 評価基盤

1. motion-debugでraw observations、MotionIntent、semantic weights、final pose、clamped bonesを保存する。
2. 同一ログのreplayでパラメータ差分を比較する。
3. neutral jitter、elbow flip count、semantic label flicker、reach clamp occupancy、dropout recovery jumpを可視化する。

---

## 13. 最終提案

`04-character-motion-design.md` の調査依頼に対する実装方針は、**「追従精度」ではなく「ものまねとして成立する意図表現」へ制御対象を変える**ことです。

最小構成としては、次を実装開始点にするのがよいです。

```text
1. MotionIntentEstimator
2. SemanticClipLayer
3. VrmPoseComposer
4. fallback / comfort pose
5. motion-debug metrics
```

最初のリリース品質では、全ての身体動作を正確に再現する必要はありません。むしろ、胴体・頭・肩を安定させ、手先・指・短いgestureだけを意味のあるclipで補助し、低confidence時には控えめな自然姿勢へ退避する方が、VRoid系キャラクターとして自然でかわいく、会話中にも邪魔になりにくい動きになります。

[1]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend "Sincromisor/sincromisor-frontend at main · Sincromisor/Sincromisor · GitHub"
[2]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/package.json "Sincromisor/sincromisor-frontend/package.json at main · Sincromisor/Sincromisor · GitHub"
[3]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character/retargeting "Sincromisor/sincromisor-frontend/src/character/retargeting at main · Sincromisor/Sincromisor · GitHub"
[4]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character/ik "Sincromisor/sincromisor-frontend/src/character/ik at main · Sincromisor/Sincromisor · GitHub"
[5]: https://www.adobe.com/creativecloud/animation/discover/principles-of-animation.html "12 Principles of Animation | Basic Animation Principles | Adobe"
[6]: https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js "Gesture recognition guide for Web  |  Google AI Edge  |  Google for Developers"
[7]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm-core.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[8]: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js "Face landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[9]: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[10]: https://research.google/blog/mediapipe-holistic-simultaneous-face-hand-and-pose-prediction-on-device/ "MediaPipe Holistic — Simultaneous Face, Hand and Pose Prediction, on Device"
[11]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback "HTMLVideoElement: requestVideoFrameCallback() method - Web APIs | MDN"
[12]: https://threejs.org/docs/ "three.js docs"
