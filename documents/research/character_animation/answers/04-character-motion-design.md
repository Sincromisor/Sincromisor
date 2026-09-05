# Sincromisor `sincro` モードキャラクターモーションデザイン調査レポート

調査対象: `sincromisor-frontend` / 添付 `04-character-motion-design.md`
対象範囲: 単眼Webカメラ + MediaPipe Pose / Hand / Face / Gesture + VRM 1.0 / VRoid Studio系モデル + Three.js / `@pixiv/three-vrm` による上半身同期

## 0. 結論

`sincro` モードのモーションデザインでは、**ユーザー姿勢の完全再現ではなく、「キャラクターがユーザーをまねている」と感じられる上半身の意図表現**を最適化対象にするべきです。添付依頼でも、対象は `chat` モードの待機動作、会話視線、表情、AI 発話ジェスチャーではなく、`sincro` モードの上半身同期に限定されています。入力は MediaPipe Pose / Hand / Face / Gesture、出力は VRM 1.0 正規化済み姿勢と加算姿勢差分、対象はVRoid Studio系アニメ調モデルです。

最終方針は次の通りです。

```text
MediaPipe 観測値
  -> 信頼性 / CanonicalUpperBodyState / TemporalState
  -> MotionIntent
  -> 追跡姿勢
  -> 意味に基づく動作加算クリップ
  -> 代替処理 / 無理のない自然姿勢
  -> VrmPoseComposer
  -> vrm.humanoid.setNormalizedPose(finalPose)
  -> vrm.update(delta)
```

この設計では、MediaPipeの特徴点を直接VRM ボーンへ流しません。既存ロードマップでも、MediaPipe 特徴点は骨格姿勢の正解値ではなく不確実な観測値として扱い、信頼性、標準状態、時系列推定、動作意図を経てからIK / FK / アニメーションクリップとしてVRMへ適用する方針が正本化されています。

---

## 1. 現行リポジトリとの整合

公開リポジトリ上では、`sincromisor-frontend` は `src`、`public`、`package.json` などを持つフロントエンド構成です。([GitHub][1]) `package.json` では `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、React、Vite などが依存関係に含まれており、今回の調査前提と整合しています。([GitHub][2])

キャラクター制御の既存実装として、`src/character/retargeting` には `sincroPoseRetargeter.ts`、`sincroPoseArmRetargeter.ts`、`sincroPoseRetargetUpperBody.ts`、`sincroPoseArmIkSolve.ts` などがあり、Pose由来の上半身動作の変換と腕IKに関する実装境界がすでに存在します。([GitHub][3]) また、`src/character/ik` には `sincroArmIkSolver.ts`、`sincroArmIkPole.ts`、`sincroArmIkConstraint.ts`、`sincroArmIkGeometry.ts` などがあり、腕IKを独立した責務として扱える構成になっています。([GitHub][4])

したがって、今回の設計は既存コードを大規模に置き換えるより、既存の `retargeting` / `ik` の前段に `MotionIntent` と `SemanticMotionLayer` を追加し、後段に `VrmPoseComposer` を明確化する形が自然です。ロードマップでも、既存の `trackingRuntime`、`poseTracking`、`character/retargeting`、`character/ik`、`motionDebug` を活かしつつ、`ReliabilityMap`、`CanonicalUpperBodyState`、`TemporalStateEstimator`、`MotionIntent`、`AvatarMotionProfile` などを追加する方針が示されています。

---

## 2. 動作設計の原則

### 2.1 最適化順位

添付依頼では、優先順位は「破綻しない」「安定している」「キャラクターとして自然に見える」「ユーザーの意図が伝わる」「実人体の姿勢へ忠実」の順に置かれています。 これは妥当です。単眼Webカメラでは、奥行き、肘方向、手首ロール、遮蔽、左右入れ替えが不安定になりやすく、完全追従を狙うほど破綻が目立ちます。

設計原則は次です。

| 原則                       | 内容                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| 大部位は安定優先           | 胴体、頭、肩は低振幅・低周波・強い平滑化を基本にする。                                       |
| 小部位は表現優先           | 手、指、短いジェスチャーは、信頼度が高い場合にやや誇張してよい。                             |
| 追従より意図               | 手振り、指差し、サムズアップ、ピース、顔近くの手は、未加工追跡ではなく動作意図化して見せる。 |
| 低信頼度時は縮退           | 動きを止めず、振幅を落として無理のない自然姿勢へ移る。                                       |
| クリップは全身上書きしない | 意味に基づく動作クリップは加算補助とし、追跡と合成する。                                     |

既存レポートでも、かわいく自然に見せるうえで最も避けるべき破綻は、胴体・頭部細かな揺れ、肘反転、肩崩れ、手首ロール暴れ、腕の伸び切り、指のちらつきの順とされています。大きい部位ほど安定、小さい部位ほど表現的に動かす設計が推奨されます。

### 2.2 アニメーション原則の取り込み

アニメーション設計では、予備動作、動作後の余韻、滑らかな加減速、弧を描く軌道、付随する動作、誇張、魅力を限定的に使います。Adobeの12原則解説でも、予備動作は観客に動作を予期させ、動作後の余韻 / 動作の重なりは停止後も一部が遅れて動くことで自然さを作り、滑らかな加減速は加減速によって動きを自然に見せ、誇張は完全な写実よりも魅力を出すために使われると説明されています。([Adobe][5])

ただし、Sincromisorでは映画的な大きい演技ではなく、会話中の同期体験が前提です。したがって、適用は小さく限定します。

```text
予備動作:
  ジェスチャークリップ開始前に肩・手首を50〜120msだけ先行させる

動作後の余韻:
  手振り終了後に手首・指だけ100〜250ms遅れて収束

滑らかな加減速:
  追跡 <-> 意味に基づく動作 <-> 代替処理の切替に必ず適用

誇張:
  指・手首・手先の軌道だけに限定し、肩・胸・頭には強く入れない
```

---

## 3. 「ものまねらしさ」の評価軸

`sincro` モードでは、全関節が正確に一致することよりも、ユーザーが「自分の動きをキャラが拾っている」と感じることが重要です。添付依頼でも、どの部位が似ていればものまねと感じやすいか、どの部位を省略・丸め・低振幅化できるかが主要論点として挙げられています。

### 3.1 似ている必要が高い部位

| 部位 / 状態      | 重要度 | 理由                                                                            |
| ---------------- | -----: | ------------------------------------------------------------------------------- |
| 手の高さ         |     高 | 手を上げた、顔の近くに持ってきた、胸前に出した、という意図が最も伝わりやすい。  |
| 手の左右位置     |     高 | 手振り、横へ広げる、片手だけ使う、両手を近づけるなどの印象に直結する。          |
| 手の開閉         |     高 | Open_Palm、Closed_Fist、Thumb_Up、Victoryなどのジェスチャー識別情報に直結する。 |
| 頭のヨー         | 中〜高 | 顔の向きは「まねている」印象に効くが、揺れすぎると不安定に見える。              |
| 腕の大まかな角度 |     中 | 肘・前腕まで完全一致しなくても、手先位置と腕の方向が合えば意図は伝わる。        |
| 体幹の向き       |     中 | 全体の向きとして必要。ただし低振幅で十分。                                      |

### 3.2 丸めてよい部位

| 部位 / 成分          | 方針                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| 奥行き方向の手先位置 | 単眼推定では不安定なため、強く圧縮する。                                                                    |
| 手首ロール           | 最も暴れやすいので25〜60%程度に抑える。既存資料でもロール成分は強く平滑化または前腕ねじれへ逃がす方針です。 |
| 肘曲がる方向         | 実測だけに寄せず、前フレーム・代替処理曲がる方向・外側偏りの補正を混ぜる。                                  |
| 肩・胸               | クリップ側で大きく上書きしない。追跡寄りに保つ。                                                            |
| 指の各関節3D回転     | 単眼ではちらつきやすいため、曲げ中心にする。                                                                |

既存資料では、指制御は最初から各関節3D回転を狙わず、まず全指開閉、次に親指・人差し指・中指・薬指小指グループの曲げへ進めるのが安全とされています。

---

## 4. 意味に基づく動作のレイヤー

### 4.1 役割

意味に基づく動作のレイヤーは、特徴点の揺れをそのまま見せる層ではなく、ユーザーの動作を「意味あるキャラクター動作」へ変換する層です。既存資料でも、意味に基づく動作のレイヤーは「動作意図・ジェスチャー化」を担当し、人間っぽいがキャラとしてかわいくない動きを補正する層として位置づけられています。

MediaPipe Gesture Recognizerは、リアルタイムの手ジェスチャー認識結果と手特徴点を返します。公式ドキュメントでは、認識カテゴリとして `None`、`Closed_Fist`、`Open_Palm`、`Pointing_Up`、`Thumb_Down`、`Thumb_Up`、`Victory`、`ILoveYou` が挙げられており、手の特徴点、ワールド座標の特徴点、左右判定、ジェスチャー分類を出力します。([Google AI for Developers][6])

ただし、Gesture Recognizerは主制御器ではなく、`MotionIntent` を決める補助入力として扱うべきです。Gesture RecognizerやHand Landmarkerの映像モードでは、存在確率信頼度や追跡信頼度に応じて手のひら検出を再実行する設計があり、アプリ側でも「検出状態」を持つべきです。([Google AI for Developers][6])

### 4.2 MotionIntent一覧

基本動作意図は添付依頼の想定である `tracking`、`wave`、`pointing`、`nearFace`、`lost`、`fallback` を採用します。 追加すべき動作意図は、`thumbsUp`、`peace`、`explain`、`clapLike`、`guarded` です。

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

### 4.3 動作意図発火条件

基本条件は、既存資料にある通り、`gesture confidence > 0.70`、`hand reliability > 0.60`、条件継続150〜250ms、待機期間 300〜800ms を初期値にします。

| 動作意図   | 発火条件                                          | 補助条件                                 | 最小継続時間 |   待機期間 |
| ---------- | ------------------------------------------------- | ---------------------------------------- | -----------: | ---------: |
| `tracking` | 明示ジェスチャーなし、姿勢・手信頼性が十分        | 通常状態                                 |          0ms |        0ms |
| `wave`     | `Open_Palm` + 手が肩〜顔高さ + 左右速度の符号反転 | 0.5〜1.2秒内に2回以上の左右往復          |        400ms | 500〜800ms |
| `pointing` | `Pointing_Up` 継続                                | 人差し指曲げ低、他指曲げ高               |        200ms | 400〜700ms |
| `thumbsUp` | `Thumb_Up` 継続                                   | 手が胸前〜肩高さ                         |        200ms |      500ms |
| `peace`    | `Victory` 継続                                    | 人差し指・中指開いた、薬指・小指曲げ     |        200ms |      500ms |
| `nearFace` | 手首または手のひら中心が顔外接矩形近傍            | 手信頼度低下時も200〜300ms保持           |        250ms |      300ms |
| `explain`  | Open_Palmまたは半開き + 片手が胸前                | 小さな左右/上下速度、会話中の説明姿勢    |        300ms |      400ms |
| `clapLike` | 両手距離が近い + 相対速度が対向                   | 実際の拍手音検出は不要。クリップは控えめ |        150ms |      800ms |
| `guarded`  | 両手が胴体前で交差/近接、左右同定が不安定         | 左右入れ替えを即反映しない               |        250ms |      500ms |
| `lost`     | 手信頼性低下                                      | Pose 手首があれば腕は継続                |        200ms |        0ms |
| `fallback` | 姿勢・手・顔全体が低信頼度                        | 無理のない自然姿勢へ退避                 |        300ms |        0ms |

手振りは `Open_Palm` だけで発火させないことが重要です。既存資料でも、手振りはOpenPalmだけでは誤発火しやすく、手が肩〜顔の高さにあり、左右速度の符号反転が0.5〜1.2秒内に2回以上ある条件を加えるとよいとされています。

---

## 5. 合成設計

### 5.1 基本ブレンド

意味に基づく動作クリップは全身上書きではなく、追跡姿勢への加算補助にします。既存資料でも、短い上半身クリップは常時上書きではなく加算合成として使い、状況に応じて追跡と意味に基づく動作クリップの比率を変える方針が示されています。

| 状況                         |       追跡 | 意味に基づく動作クリップ | 代替処理 / 無理のない自然姿勢 | 備考                         |
| ---------------------------- | ---------: | -----------------------: | ----------------------------: | ---------------------------- |
| 通常追跡                     | 0.85〜0.95 |               0.05〜0.15 |                          0.00 | 微小な丸め・呼吸程度。       |
| 軽い意図検出                 | 0.70〜0.85 |               0.15〜0.30 |                          0.00 | explain / nearFace初期。     |
| 指差し / ピース安定          | 0.60〜0.75 |               0.25〜0.40 |                          0.00 | 手首・指はクリップ寄り。     |
| 手振り                       | 0.40〜0.70 |               0.30〜0.60 |                          0.00 | 手先軌道をクリップで安定化。 |
| 追跡低下中のジェスチャー継続 | 0.30〜0.50 |               0.50〜0.70 |                    0.00〜0.20 | nearFace / 手振り維持。      |
| 手未検出 200〜700ms          | 0.20〜0.40 |               0.00〜0.20 |                    0.40〜0.70 | 腕は無理のない姿勢へ。       |
| 代替処理                     | 0.00〜0.20 |                     0.00 |                    0.80〜1.00 | 動きを止めず自然姿勢へ。     |

### 5.2 部位別ブレンド

| 部位                     | 追跡寄り | 意味に基づく動作寄り | 代替処理寄り | 方針                                           |
| ------------------------ | -------: | -------------------: | -----------: | ---------------------------------------------- |
| 背骨 / 胸 / `upperChest` |       高 |                   低 |           中 | 低振幅・安定優先。                             |
| 首 / 頭部                |       中 |                   低 |           中 | 頭部ヨーは追従、ピッチ・ロールは控えめ。       |
| 肩                       |       高 |                   低 |           中 | クリップで大きく上書きしない。                 |
| `upperArm`               |   中〜高 |                   中 |           中 | 意図に応じて30%程度クリップ。                  |
| `lowerArm`               |       中 |               中〜高 |           中 | 指差し・手振りでクリップ寄り。                 |
| 手首ピッチ・ヨー         |       中 |               中〜高 |           中 | ジェスチャー印象に効く。                       |
| 手首ロール               |       低 |               低〜中 |           高 | 強く抑制。                                     |
| 指                       |       中 |                   高 |           中 | 意味に基づく動作ジェスチャー時はクリップ寄り。 |

three-vrm適用では、Animation / IK / 意味に基づく動作 / 代替処理をそれぞれ姿勢差分として出力し、`PoseComposer` で1つの `finalPose` に合成してから `setNormalizedPose(finalPose)` を1回だけ呼び、最後に `vrm.update(delta)` を呼ぶ設計にします。これは同じボーンに複数の書き手を作らないためです。

three-vrmの `VRMHumanoid.getNormalizedPose()` / `setNormalizedPose()` は、各変換を初期姿勢 / T-poseからのローカル変換として扱うAPIです。`autoUpdateHumanBones` が有効な場合は正規化済みの人型ボーンから元の人型ボーンへ転送されるため、通常制御では `setNormalizedPose()` を主経路にするのが妥当です。([Pixiv][7])

---

## 6. 手作業で制作する上半身クリップ一覧

最初に用意すべきクリップは、検出が不安定になりやすいがユーザー意図としては重要なものに限定します。添付依頼でも、手振り、指差し、サムズアップ、ピース、顔近くの手などのクリップ設計が期待成果物に含まれています。

| クリップ              | 対応動作意図        |      長さ / 周期 | 主に触るボーン                   | 追跡に残すボーン                 |   推奨重み |
| --------------------- | ------------------- | ---------------: | -------------------------------- | -------------------------------- | ---------: |
| `small_wave`          | `wave`              | 0.8〜1.2s ループ | 前腕, 手首, 指                   | 体幹, 頭部, 肩, `upperArm`の大枠 | 0.30〜0.60 |
| `point_forward_or_up` | `pointing`          | 0.35〜0.60s 保持 | 手首, 人差し指, その他指, 前腕   | 肩, `upperArm`, 体幹             | 0.25〜0.40 |
| `thumbs_up_hold`      | `thumbsUp`          |   0.4〜0.8s 保持 | 親指, 手首, 指                   | 腕目標, 体幹                     | 0.25〜0.45 |
| `peace_hold`          | `peace`             |   0.4〜0.8s 保持 | 人差し指, 中指, 薬指・小指, 手首 | 腕目標, 体幹                     | 0.25〜0.45 |
| `shy_hand_near_face`  | `nearFace`          |   0.5〜1.0s 保持 | 手首, 指, `lowerArm`             | 頭部ヨー, 肩, 体幹               | 0.20〜0.40 |
| `explain_open_palm`   | `explain`           | 0.6〜1.2s ループ | 手首, 指, `lowerArm`             | `upperArm`, 肩, 体幹             | 0.15〜0.30 |
| `soft_clap_like`      | `clapLike`          |        0.3〜0.6s | 両方の手首, 指                   | 両肩, 胸                         | 0.20〜0.35 |
| `lost_to_comfort`     | `lost` / `fallback` |        0.5〜0.9s | 腕, 手首, 指                     | 頭部・胴体低周波の追跡           | 0.40〜1.00 |

ここで重要なのは、クリップの「完全再生」を目的にしないことです。既存資料でも、`small_wave`、`point_up`、`thumbs_up`、`shy_hand_near_face`、`clap_like`、`explain_gesture` などを短い上半身クリップとして用意し、追跡結果と加算合成する方針が示されています。

---

## 7. 表現の調整パラメータ

`sincro` モードに閉じた演出パラメータは、キャラクターの性格全体ではなく、同期モーションの安全性とかわいさを調整するための低次元パラメータに限定します。

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

### 8.1 信頼度に応じた振幅制御

低信頼度時は即座に中立姿勢へ戻さず、振幅を縮小して無理のない自然姿勢へ移行します。既存資料でも、「控えめだが破綻しない」動きを優先し、最終的な設計原則として動きの大きさを信頼度に比例させる方針が示されています。

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

|       時間 | 腕                                          | 肘曲がる方向                  | 手首                   | 指               | 意味に基づく動作 |
| ---------: | ------------------------------------------- | ----------------------------- | ---------------------- | ---------------- | ---------------- |
|   0〜200ms | Pose 手首があれば継続。なければ速度減衰予測 | 前フレーム保持 + 代替処理混合 | 直前姿勢保持           | 直前姿勢保持     | 200〜300ms保持   |
| 200〜700ms | 無理のない自然姿勢へ戻す                    | 代替処理比率を上げる          | 前腕に沿った中立姿勢へ | 半開き中立姿勢へ | 徐々に弱める     |
|  700ms以降 | 初期姿勢寄りに安定                          | 代替処理中心                  | 中立姿勢維持           | 力を抜いた手     | 非アクティブ     |

### 8.3 頭部欠落時

Face Landmarkerは3D 顔の特徴点、ブレンドシェイプスコア、顔の変換行列を出力できます。頭部姿勢ではFace 行列を主入力にし、Pose由来の鼻・目・耳は代替処理として扱うのが妥当です。([Google AI for Developers][8]) Face Landmarkerの平滑化は `numFaces` が1のときのみ適用されるため、`sincro` モードでは原則1人想定にするのが安全です。([Google AI for Developers][8])

既存資料でも、Pose 代替処理はヨー補助中心とし、ピッチ / ロールは弱く扱い、欠落時は頭を即中立姿勢へ戻さず`upperChest`方向へ0.5〜1.0秒程度で戻すのが自然とされています。

---

## 9. MediaPipe / 検出設計への示唆

### 9.1 Pose起点ROI

MediaPipe Pose Landmarkerは、画像または動画から身体特徴点を検出し、画像座標と3D ワールド座標を出力します。([Google AI for Developers][9]) Pose Landmarkerには `outputSegmentationMasks` などのオプションがあり、`detectForVideo()` は同期実行でUIスレッドをブロックするため、必要に応じてWeb Worker分離が推奨されます。([Google AI for Developers][9])

手・顔の安定化では、Poseを全体検出として使い、Pose 手首や顔領域からHand / Face ROIを作るのが有効です。Google ResearchのMediaPipe Holistic解説では、姿勢特徴点から左右の手と顔の対象領域の切り出しを導出し、元の解像度のフレームから領域ごとのモデルへ渡す複数段階の処理工程が説明されています。([Google Research][10]) また、姿勢予測を毎フレームROI 事前情報として使うことで、速い動きへの応答と左右の意味に基づく動作整合性を改善し、左右の手や身体部位の取り違えを防ぐ意図が説明されています。([Google Research][10])

### 9.2 FrameClock

`requestVideoFrameCallback()` は、新しい映像フレームが画面合成処理へ送られるタイミングでコールバックを実行し、`mediaTime`、`presentationTime`、`presentedFrames` などのメタデータを提供します。`presentedFrames` はコールバック間でフレームが欠落したかの検出に使えます。([MDN Web 文書][11]) MDNでは、映像解析やcanvas 描画などのフレームごとの処理に有効で、`requestAnimationFrame()` と違って映像フレームレートに合わせる性質があると説明されています。([MDN Web 文書][11])

したがって、Pose / Hand / Face / Gestureの時刻は同一映像フレーム基準で揃え、意味に基づく動作ジェスチャーの最小継続時間や待機期間もこのFrameClock上で扱います。

---

## 10. VRM 姿勢合成規約

three-vrmへ渡す姿勢は、各ボーンのワールド回転ではなく、正規化済みの初期姿勢 / T-poseからのローカル回転差分です。既存three-vrmレポートでも、Quaternionで扱い、毎フレーム正規化し、最終適用を `setNormalizedPose()` に集約する規約が示されています。

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

`AnimationMixer` を本番VRMに直接当てる方式は、MediaPipe追従、IK、意味に基づく動作クリップ、代替処理が同じボーンを書き換える競合を起こしやすいため、長期的には `VRMPoseDelta` を自前保持する姿勢合成処理方式、または評価用の骨格でクリップを評価して姿勢を読む方式が安全です。 Three.jsの `AnimationMixer` 自体は、特定Object3D上のアニメーション再生処理として提供されていますが、今回の用途では「主制御器」ではなく「クリップ評価器」として限定利用するのがよいです。([Three.js][12])

---

## 11. 主観評価チェックリスト

### 11.1 ものまねらしさ

| チェック              | 合格基準                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| 手を上げたとき        | キャラも同じ側の手を上げたと感じられる。                               |
| 手を振ったとき        | 手先の左右周期が見え、細かな揺れではなく手振りに見える。               |
| 指差し                | 指差し方向が完全一致しなくても、指差しジェスチャーとして認識できる。   |
| サムズアップ / ピース | 指形状が1秒程度安定して見える。                                        |
| 顔近くの手            | 手が急に落ちず、顔近くの仕草として保持される。                         |
| 両手動作              | 左右入れ替えが一瞬起きても、見た目の意味に基づく動作連続性が保たれる。 |

### 11.2 会話中の邪魔にならなさ

| チェック       | 合格基準                                             |
| -------------- | ---------------------------------------------------- |
| 中立姿勢 10秒  | 胴体・頭が揺れて壊れて見えない。                     |
| 発話中の小動作 | 手の動きが発話内容への注意を奪わない。               |
| 大きな手振り   | 画面内で収まり、顔や胴体にめり込まない。             |
| 追跡低下       | 急停止・急落下ではなく、自然に小さな動きへ縮退する。 |
| 長時間視聴     | 目が疲れる細かな揺れや過剰な揺れがない。             |

### 11.3 破綻チェック

既存ロードマップの破綻優先順位に従い、次を必須確認項目にします。

| 優先度 | 項目                 | 観測方法                                     |
| -----: | -------------------- | -------------------------------------------- |
|      1 | 胴体・頭部細かな揺れ | 中立姿勢 10秒の角速度急増                    |
|      2 | 肘反転               | 肘の曲がる方向符号反転回数                   |
|      3 | 肩崩れ / 肩めり込み  | 腕上げ時の肩・胸の変形確認                   |
|      4 | 手首ロール暴れ       | 手首ロール角速度、手の見た目                 |
|      5 | 腕の伸び切り         | 到達距離制限の発生率                         |
|      6 | 指のちらつき         | ジェスチャー表示名ちらつき、指の曲げばらつき |
|      7 | 左右入れ替え         | 左右判定入れ替え件数                         |
|      8 | 再検出ジャンプ       | 観測欠落からの復帰時の急変                   |

---

## 12. 実装ロードマップ

### 段階 A: MotionIntent基盤

1. `MotionIntentEstimator` を追加する。
2. Gesture Recognizerの結果を直接ボーンへ使わず、意味に基づく動作表示名として読む。
3. `tracking / wave / pointing / thumbsUp / peace / nearFace / explain / clapLike / guarded / lost / fallback` を状態機械として扱う。
4. ヒステリシス、最小継続時間、待機期間をFrameClock基準で実装する。

### 段階 B: SemanticClipLayer

1. `VRMPoseDelta` 形式で短い上半身クリップを定義する。
2. `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`lost_to_comfort` から作る。
3. クリップは肩・胸・頭を強く上書きせず、主に前腕、手首、指に効かせる。

### 段階 C: VrmPoseComposer

1. 追跡姿勢、意味に基づく動作の姿勢差分、代替処理姿勢、演出値の制限を1箇所で合成する。
2. Quaternionはslerpまたは対数空間での合成で合成する。
3. 所有ボーンは毎フレーム必ず出力する。
4. `vrm.humanoid.setNormalizedPose(finalPose)` と `vrm.update(delta)` を最終段に集約する。

### 段階 D: 代替処理 / 無理のない自然姿勢

1. 信頼度低下時の振幅縮小を導入する。
2. 手未検出時の0〜200ms、200〜700ms、700ms以降の部位別挙動を実装する。
3. 頭部未検出時は`upperChest`方向へ0.5〜1.0秒で戻す。
4. `lost_to_comfort` クリップで「追従していない」ことを目立たせない。

### 段階 E: 評価基盤

1. motion-debugで未加工の観測値、MotionIntent、意味に基づく動作重み、最終姿勢、制限済みボーンを保存する。
2. 同一ログの再生でパラメータ差分を比較する。
3. 中立姿勢での細かな揺れ、肘の反転回数、意味分類のちらつき、到達距離制限の発生率、観測欠落からの復帰時の急変を可視化する。

---

## 13. 最終提案

`04-character-motion-design.md` の調査依頼に対する実装方針は、**「追従精度」ではなく「ものまねとして成立する意図表現」へ制御対象を変える**ことです。

最小構成としては、次を実装開始点にするのがよいです。

```text
1. MotionIntentEstimator
2. SemanticClipLayer
3. VrmPoseComposer
4. 代替処理 / 無理のない自然姿勢
5. motion-debug 評価指標
```

最初のリリース品質では、全ての身体動作を正確に再現する必要はありません。むしろ、胴体・頭・肩を安定させ、手先・指・短いジェスチャーだけを意味のあるクリップで補助し、低信頼度時には控えめな自然姿勢へ退避する方が、VRoid系キャラクターとして自然でかわいく、会話中にも邪魔になりにくい動きになります。

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
