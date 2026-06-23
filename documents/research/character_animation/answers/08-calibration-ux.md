# 08-calibration-ux.md 調査レポート：`sincro` キャリブレーション / UX ガイド

対象: `sincromisor-frontend` の単眼 Web カメラ上半身モーション同期
前提: MediaPipe Pose / Hand / Face、VRM 1.0、Three.js、three-vrm、VRoid Studio 系モデル
調査時点: 2026-06-14

## 0. 結論

`sincro` モードのキャリブレーション UX は、**短い初期キャリブレーション + 継続的な online calibration + ユーザーが直せる camera quality guide + 自然な fallback motion**として設計するのが最適です。添付依頼では、専門用語をユーザーに見せず、短時間で姿勢同期を開始し、問題時にはユーザーが取れる行動として案内することが重視されています。

推奨方針は次です。

| 領域                   | 推奨                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初期キャリブレーション | **4〜5秒の 3-step** を標準にする。必須は「正面自然姿勢」「軽い A ポーズ」「軽く開いた手」。顔左右は任意。                                           |
| T ポーズ               | 標準 UX では避ける。単眼 Web カメラでは手が画面外に出やすく、肩も不自然になる。                                                                     |
| 成功判定               | MediaPipe の検出成功だけでなく、**安定フレーム数、肩・肘・手首の画面内率、border risk、姿勢の揺れ、骨長一貫性**で判定する。                         |
| online calibration     | 人間側の観測基準だけを、高信頼度かつ near-neutral 時に低速更新する。アバター構造値、VRM rest rotation、bone length、handedness mapping は固定。     |
| カメラ品質 UX          | 内部では数値スコアを持つが、表示は「少し下がってください」「部屋を明るくしてください」のような行動文に変換する。                                    |
| 通常 UI                | `開始 / 停止`、カメラ選択、動きの強さ、再キャリブレーション、ヘルプに絞る。                                                                         |
| debug UI               | reliability、raw landmarks、camera score、fallback reason、online calibration 状態、AvatarMotionProfile を表示する。                                |
| 失敗時 UX              | hard failure は chat mode へ戻す。soft failure は face-only / idle motion / comfortable pose に退避し、同期不能でもキャラクターを不自然に止めない。 |

既存資料の方向性とも整合します。ロードマップでは、MediaPipe landmark を直接 VRM bone に流すのではなく、ReliabilityMap、CanonicalUpperBodyState、TemporalStateEstimator、MotionIntent、AvatarMotionProfile を挟む構成が目標アーキテクチャとして示されています。 また、VRM 側は three-vrm を humanoid runtime として扱い、最終姿勢を normalized pose に集約する方針が妥当です。three-vrm の `getNormalizedPose()` は rest pose / T-pose からの local transform を返す設計で、normalized pose をモデル差分吸収の境界として使う理由があります。 ([Pixiv][1])

---

## 1. 現状リポジトリ観察

公開リポジトリで確認できる範囲では、`sincromisor-frontend` は `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three` を依存に持ち、MediaPipe + three-vrm + Three.js の前提は実装上も一致しています。([GitHub][2])

構成面では、`features/gaze/trackingRuntime` が camera / video / Worker / fallback の所有境界になっており、`features/gaze/poseTracking` が PoseLandmarker 結果から内部 snapshot を作り、`character/ik` や `character/retargeting` が VRM 向けの後段処理を担う方向です。これは既存 roadmap が「現行責務境界を活かしつつ中間層を太らせる」としている方針と合っています。

一方で、キャリブレーション / UX ガイド観点では次が未整備または強化余地です。

| 観点           | 現状から見えること                                                                                                                                                   | 推奨する追加                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FrameClock     | `TrackerRuntimeFrameLoop` は `requestAnimationFrame` で推論 loop を回している。([GitHub][3])                                                                         | `requestVideoFrameCallback()` ベースへ移行し、動画フレーム時刻、frame drop、実 video frame 単位の品質を扱う。 |
| PoseLandmarker | Pose は `runningMode: "VIDEO"`、`numPoses: 1`、confidence 0.5、`outputSegmentationMasks: false`。([GitHub][4])                                                       | segmentation mask を品質判定用に optional 有効化し、遮蔽・背景誤検出・肩欠けを評価する。                      |
| fallback       | Pose 初期化失敗、推論エラー、性能劣化時に face-only へ degrade する経路がある。([GitHub][5])                                                                         | ユーザー向け文言、再試行導線、chat mode への戻し条件を UX レイヤーで整理する。                                |
| 性能 gate      | 連続失敗 18 回、推論遅延 warning 4 回などの降格判定がある。([GitHub][6])                                                                                             | camera quality、calibration status、online calibration freeze reason を同じ debug snapshot に載せる。         |
| Snapshot       | `SincroPoseMotionSnapshot` には `confidence`、`inferenceTimeMs`、`inferenceFps`、`consecutiveFailures`、`degradedToFaceOnly`、`fallbackReason` がある。([GitHub][7]) | `CameraQualityScore`、`CalibrationStatus`、`UserFacingGuide[]` を追加する。                                   |

MediaPipe の Web API は `detectForVideo()` が同期実行で UI thread をブロックするため、公式ドキュメントでも Worker 利用が推奨されています。現状の Worker fallback 方針は妥当ですが、UX / calibration の精度を上げるには、単なる fps 制限ではなく「どの video frame を評価したか」を保持する必要があります。([Google for Developers][8])

---

## 2. 初期キャリブレーションフロー

### 2.1 標準フロー

標準は **3-step + optional 1-step** です。既存資料では「正面自然姿勢 + 軽い A ポーズ」が推奨され、T ポーズは手が画面外に出やすく肩も不自然になるため、上半身用途では実用性が低いと整理されています。

| Step |      時間 | ユーザー表示                               | 取得値                                                   | 失敗時の主な案内                             |
| ---: | --------: | ------------------------------------------ | -------------------------------------------------------- | -------------------------------------------- |
|    0 | 0.5〜1.0s | 「顔と肩が入る位置にしてください」         | camera settings、顔/肩/胴体の画面内率                    | 「少し下がって、肩まで画面に入れてください」 |
|    1 |      1.5s | 「正面を向いて、肩の力を抜いてください」   | neutral torso、shoulder width、head neutral、body center | 「正面を向いてください」                     |
|    2 |      1.5s | 「肘を軽く曲げ、腕を少し開いてください」   | upper / lower arm length、elbow plane、腕の可動基準      | 「肘と手首が見えるようにしてください」       |
|    3 |      1.0s | 「手を胸から腰の高さで軽く開いてください」 | hand scale、finger neutral、palm basis 補助              | 「手をカメラに見える位置へ移動してください」 |
|    4 | 任意 1.0s | 「顔を少し左右に向けてください」           | head yaw fallback                                        | 失敗しても開始可能                           |

3-step の合計は 4〜5 秒で、依頼にある 4〜6 秒案の範囲に収まります。 顔左右は必須にしないほうがよく、head yaw fallback は FaceLandmarker の安定性が低い端末や暗い環境向けの補助値として扱います。

### 2.2 さらに短い手順

短縮版は **2-step / 3〜4秒** です。

| モード   | 内容                         | 用途             | 制限                                     |
| -------- | ---------------------------- | ---------------- | ---------------------------------------- |
| 標準     | neutral + A pose + hand open | 推奨デフォルト   | 4〜5秒必要                               |
| 短縮     | neutral + A pose             | 初回離脱を減らす | 手・指の neutral は online で後追い      |
| 即時開始 | precheck のみ                | プレビュー、デモ | 腕長・手指・正面基準が不安定になりやすい |

本番の `sincro` では標準を推奨します。即時開始は「動きのプレビュー」としてのみ使い、正式な同期開始前には再キャリブレーションを促すべきです。

### 2.3 成功 / 失敗判定

成功判定は「モデルが何かを検出した」ではなく、**一定時間、制御に使える観測が安定していたか**で判定します。MediaPipe Pose は image landmarks、world landmarks、presence、visibility、segmentation mask を返せるため、これらを直接 UX に出すのではなく reliability / camera quality に変換します。([Google for Developers][8])

推奨する初期値は次です。実装後、debug replay で調整します。

| 判定カテゴリ              |     ready | degraded ready |     retry |
| ------------------------- | --------: | -------------: | --------: |
| step 有効時間             | 1.0s 以上 |      0.7s 以上 | 0.7s 未満 |
| torso reliability         | 0.75 以上 |      0.60 以上 | 0.60 未満 |
| head reliability          | 0.70 以上 |      0.55 以上 | 0.55 未満 |
| elbow / wrist reliability | 0.65 以上 |      0.50 以上 | 0.50 未満 |
| shoulder width CV         |   8% 未満 |       12% 未満 |  12% 以上 |
| neutral yaw               | ±10° 程度 |      ±15° 程度 |  それ以上 |
| border risk               | 0.30 未満 |      0.45 未満 | 0.45 以上 |
| motion blur risk          | 0.50 未満 |      0.70 未満 | 0.70 以上 |

状態は 4 段階にします。

```ts
type CalibrationStatus =
    | "not_started"
    | "ready"
    | "ready_without_hands"
    | "retry_recommended"
    | "failed";
```

`ready_without_hands` を設けることが重要です。手や指だけが不安定な場合に `sincro` 全体を拒否すると UX が重くなります。腕・肩・頭が使えるなら開始し、手指は fallback / online calibration で補います。

### 2.4 リトライ UX

失敗時は全体をやり直させず、**失敗した step だけを再試行**します。

| 状態                    | UX                                                                    |
| ----------------------- | --------------------------------------------------------------------- |
| 画面内に肩が入らない    | step 0 に戻す。「肩まで画面に入るように少し下がってください」         |
| A pose で手首が見えない | step 2 のみ再実行。「肘と手首が見える位置で、腕を少し開いてください」 |
| 手の step が失敗        | `ready_without_hands` で開始可。「手の動きはあとで自動調整します」    |
| 暗い / blur             | step を止めずに案内を出し、改善後に自動再開                           |
| 何度も失敗              | chat mode 継続 + 再試行ボタン                                         |

警告は最大 2 個です。通常ユーザーには「主警告 1 件 + 小さな補助ヒント 1 件」までにします。debug UI には全 reason を表示します。

---

## 3. online calibration policy

### 3.1 更新してよい値

online calibration は、**人間側の観測基準の低速更新**に限定します。既存 roadmap でも、AvatarMotionProfile / calibration では VRM load 時に rest local rotation、bone length、shoulder width、head size、optional bones を計測し、初期 calibration は neutral + A pose、online calibration は高信頼度・near-neutral 時だけ肩幅や neutral yaw を低速更新する方針です。

| 値                              | 更新可否   | 条件                                                    |
| ------------------------------- | ---------- | ------------------------------------------------------- |
| torso center                    | 可         | torso reliability 高、画面中央付近、急な移動なし        |
| observed shoulder width         | 可         | 両肩が見える、正面、腕が下がっている                    |
| neutral torso yaw / roll 微修正 | 可         | Face と shoulder line が整合、near-neutral              |
| head neutral offset             | 可         | FaceLandmarker 高信頼度、顔が正面に近い                 |
| camera body scale               | 可         | 肩幅・顔サイズ・torso box が安定                        |
| hand open baseline              | 可         | 手が画面中央、hand reliability 高、開き手が一定時間継続 |
| finger curl neutral             | 条件付き可 | HandLandmarker が安定している場合のみ                   |

### 3.2 更新してはいけない値

| 値                           | 固定理由                                                             |
| ---------------------------- | -------------------------------------------------------------------- |
| VRM bone length              | アバター構造値であり、ユーザー姿勢で変えるとモデル差分吸収が破綻する |
| VRM rest rotation offset     | 動的に変えると normalized pose の意味が変わる                        |
| humanoid bone mapping        | VRM 1.0 の構造定義に属する                                           |
| handedness mapping           | online で揺らすと左右入れ替え事故になる                              |
| 関節可動域 limit             | 推定誤差に追従して破綻を許容してしまう                               |
| palm basis 軸定義            | 実装規約であり、観測ごとに変えるべきではない                         |
| AvatarMotionProfile の構造値 | debug / profile 編集でのみ変更する                                   |

VRM 1.0 の humanoid は humanBones mapping を持ち、必須 bone と optional bone の差分があります。non-humanoid node が humanoid bone の間に挟まることも許容されるため、モデル構造値は runtime calibration ではなく AvatarMotionProfile 側で扱うべきです。([GitHub][9])

### 3.3 更新速度

online calibration は EMA で実装し、時間定数を明示します。既存 report02 でも、高信頼度・near-neutral 時のみ `lerp(..., 0.001)` のような低速更新が例示されています。

| 値                            | 推奨時定数 | 目安                             |
| ----------------------------- | ---------: | -------------------------------- |
| torso center                  |    20〜60s | 椅子位置の微変化へ追従           |
| shoulder width / body scale   |   60〜180s | drift 防止を優先                 |
| neutral yaw / roll            |   60〜120s | 常時斜めになる問題をゆっくり補正 |
| head neutral                  |    30〜90s | 首の傾き補正                     |
| hand open baseline            |    10〜30s | 手指は環境差が大きいためやや速め |
| camera quality moving average |      1〜3s | UX 表示用。ちらつき抑制          |

実装例:

```ts
function emaByTau(
    current: number,
    observed: number,
    dtSec: number,
    tauSec: number,
): number {
    const alpha = 1 - Math.exp(-dtSec / tauSec);
    return current * (1 - alpha) + observed * alpha;
}
```

### 3.4 near-neutral 判定

online calibration の gate は次を全て満たす場合だけ開きます。

```ts
type OnlineCalibrationGate = {
    torsoReliability: number; // > 0.85
    headReliability: number; // > 0.80
    bothShouldersVisible: boolean;
    borderRisk: number; // < 0.30
    motionBlurRisk: number; // < 0.50
    torsoAngularVelocity: number; // low
    armActivity: number; // low
    faceYawAbs: number; // < 10〜12 deg
    boneLengthConsistency: number; // > 0.80
};
```

ユーザーが姿勢を変えたのか推定が外れたのかは、次のように分けます。

| 状態       | 判定                                                                 | 処理                                           |
| ---------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| 実姿勢変化 | 複数関節が一貫して移動、confidence 高、bone length 一貫、速度連続    | 状態推定として追従。calibration は急更新しない |
| 推定外れ   | 1〜2 joint だけ急ジャンプ、confidence 低下、画面端、bone length 崩れ | reliability を下げ、calibration 更新を freeze  |
| カメラ移動 | 顔・肩・torso box 全体が同方向に移動、scale も変化                   | camera/body scale を低速更新                   |
| 遮蔽       | segmentation / visibility / border risk 悪化、手や肘だけ消える       | 該当部位だけ Predicted / Lost へ遷移           |

既存資料でも、reliability は presence / visibility / tracking confidence だけでなく、border、bone length、temporal consistency、side consistency を合成する方針が示されています。

### 3.5 drift guard

drift 防止のため、online calibration は初期値からの逸脱範囲を持ちます。

| 値                        |                推奨 clamp |
| ------------------------- | ------------------------: |
| observed shoulder width   |               初期値 ±15% |
| body scale                |               初期値 ±20% |
| neutral torso yaw         |            初期値 ±8〜10° |
| neutral head pitch / roll |            初期値 ±8〜10° |
| hand scale                |               初期値 ±20% |
| camera center             | 画面幅 / 高さの ±15% 程度 |

加えて、`candidate` と `committed` の 2 段階に分けます。短期観測は `candidate` に蓄積し、3〜5 秒以上安定した場合だけ `committed` に反映します。

---

## 4. Camera quality guide 文言集

内部では `CameraQualityScore` を持ち、通常 UI では「ユーザーが直せる行動」に変換します。report02 では `frameWidth`、`frameHeight`、`actualFrameRate`、`torsoInFrame`、`handsInFrame`、`motionBlurRisk`、`underExposureRisk`、`borderRisk` を含む `CameraQualityScore` が提案されています。

| 優先度 | 問題                 | 通常ユーザー向け文言                                         | debug 表示                                          | 推奨アクション              |
| -----: | -------------------- | ------------------------------------------------------------ | --------------------------------------------------- | --------------------------- |
|      1 | カメラ権限なし       | カメラの使用を許可してください。                             | `getUserMedia: NotAllowedError`                     | browser permission guide    |
|      1 | カメラなし           | 使用できるカメラが見つかりません。                           | `getUserMedia: NotFoundError`                       | camera selector / chat mode |
|      1 | 肩が入っていない     | 肩まで画面に入るように、少し下がってください。               | `torsoInFrame < threshold`, shoulder visibility low | calibration block           |
|      1 | 顔だけ大きい         | 少し離れて、胸のあたりまで入れてください。                   | face box too large, shoulder width too wide         | calibration block           |
|      2 | 正面を向いていない   | 正面を向いてください。                                       | face yaw / shoulder yaw high                        | neutral step retry          |
|      2 | 手や肘が隠れている   | 肘と手が見えるようにしてください。                           | elbow / wrist reliability low, occlusion risk       | A pose retry                |
|      2 | 露出不足             | 部屋を明るくしてください。                                   | low luma, confidence drop                           | soft block                  |
|      3 | motion blur          | ゆっくり動くか、部屋を明るくしてください。                   | high landmark velocity, blur risk                   | warning                     |
|      3 | 手が画面端に近い     | 手が画面の端に近いです。少し中央へ移動してください。         | left/right borderRisk high                          | hand degraded               |
|      4 | 手が小さく写っている | 手が見えにくいです。胸から腰の高さでカメラに見せてください。 | hand bbox / palm footprint small, ROI failure       | hand optional retry         |

`getUserMedia()` は secure context とユーザー許可が必要で、権限拒否やカメラ未検出などは `NotAllowedError`、`NotFoundError`、`NotReadableError`、`OverconstrainedError` などとして扱われます。これらはユーザーが直せる場合と直せない場合があるため、hard failure の文言は camera quality warning と分けるべきです。([MDNウェブドキュメント][10])

表示優先順位は次です。

```text
hard failure
  > body framing
  > front-facing / occlusion
  > lighting / blur
  > hand edge / hand small
  > debug-only details
```

通常 UI では「今直すべき 1 件」だけを banner 表示し、2 件目は小さな補助ヒントに留めます。debug UI では全 reason と score を一覧表示します。

---

## 5. 設定 UI

### 5.1 通常 UI に出すべき項目

通常 UI は最小にします。

| 項目             | 表示名                   |         初期値 | 理由                                 |
| ---------------- | ------------------------ | -------------: | ------------------------------------ |
| start / stop     | `sincro を開始` / `停止` |              - | 明確な主操作                         |
| camera selector  | `カメラ`                 | default device | 複数カメラ対応                       |
| recalibration    | `姿勢を合わせ直す`       |              - | 環境変化への逃げ道                   |
| motion strength  | `動きの強さ`             |       60 / 100 | キャラ差・好みを単一スライダーで吸収 |
| lightweight mode | `軽量モード`             |           auto | 低性能端末向け                       |
| help             | `うまく動かないとき`     |              - | camera guide 表示                    |

### 5.2 debug UI にだけ出す項目

| カテゴリ    | 項目                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------- |
| camera      | `getSettings()`、actual width / height / fps、frame drop、rVFC metadata                            |
| MediaPipe   | model path、wasm path、delegate、detect time、confidence、segmentation on/off                      |
| reliability | joint / part weight、presence、visibility、border、bone length consistency、temporal innovation    |
| calibration | current status、step reason、online gate、freeze reason、EMA values、drift clamp                   |
| avatar      | AvatarMotionProfile、bone length、optional bones、reach scale、depth compression、shoulder damping |
| fallback    | degradedToFaceOnly、fallbackReason、performance gate reason、chat mode fallback reason             |
| replay      | raw result recording、final pose、metrics、replay controls                                         |

Media Capture API では constraints は要求値であり、実際の設定は `MediaStreamTrack.getSettings()` で確認する必要があります。したがって、debug UI では request constraints と actual settings を分けて表示します。([MDNウェブドキュメント][11])

### 5.3 motion strength スライダーで吸収できる範囲

`motion strength` は「推定の正しさ」ではなく「キャラクター表現の強さ」を変えるスライダーにします。

| 内部値               | motion strength 低 | 標準 |   高 |
| -------------------- | -----------------: | ---: | ---: |
| arm reach scale      |               0.75 | 0.90 | 1.00 |
| lateral openness     |               0.70 | 0.90 | 1.05 |
| depth influence      |               0.35 | 0.55 | 0.70 |
| chest follow         |               0.25 | 0.45 | 0.65 |
| wrist roll influence |               0.20 | 0.40 | 0.55 |
| finger expression    |               0.50 | 0.80 | 1.00 |

吸収できないものは、camera quality guide に回します。例えば、肩が入っていない、部屋が暗い、手が隠れている、モデル / wasm が読み込めない、といった問題はスライダーでは解決しません。

### 5.4 キャラクター別 profile を見せるべきか

通常 UI では見せないほうがよいです。表示する場合は「このキャラクターの動きをリセット」程度に留めます。

内部的には `AvatarMotionProfile` をキャラクターごとに保存します。roadmap では、VRM load 時に rest local rotation、bone length、shoulder width、head size、optional bones を計測し、reach scale、depth compression、elbow outward bias、shoulder damping、wrist roll influence を持たせる方針が示されています。

---

## 6. 失敗時 fallback UX

### 6.1 `sincro` を無効化して chat mode へ戻す条件

| 条件                            | 分類 | UX                                                       |
| ------------------------------- | ---- | -------------------------------------------------------- |
| カメラ権限拒否                  | hard | chat mode 継続。「カメラを許可すると sincro を使えます」 |
| カメラなし                      | hard | chat mode 継続。カメラ選択 / 接続案内                    |
| insecure context                | hard | chat mode 継続。環境側の問題として表示                   |
| MediaPipe model / wasm 配置漏れ | hard | chat mode 継続。ユーザーでは直せないため短く通知         |
| Face / Pose runtime 全体エラー  | hard | chat mode 継続 + debug に error                          |
| Pose のみ初期化失敗             | soft | face-only + idle upper-body                              |
| Pose 推論が遅すぎる             | soft | face-only / lightweight mode                             |
| 肩が入らない                    | soft | calibration 停止、framing guide                          |
| 手だけ見えない                  | soft | body sync 継続、hand fallback                            |
| 暗い / blur                     | soft | warning + confidence 低下、改善待ち                      |

現状実装にも、Pose 初期化失敗や推論中エラー、性能 gate によって face-only に degrade する経路があります。([GitHub][5]) これを UX レイヤーでは「故障」ではなく「カメラなしでも会話は継続できます」という自然なフォールバックに変換します。

### 6.2 fallback 中の motion

fallback 中に避けるべきなのは、キャラクターが突然 T-pose / 無表情 / 完全停止になることです。既存資料でも、最適化対象は人体忠実性より「破綻しない」「安定している」「キャラクターとして自然」が優先とされています。

推奨 fallback motion:

| 状態      | motion                                     |
| --------- | ------------------------------------------ |
| face-only | 顔向き、軽い頷き、呼吸、肩の微小揺れ       |
| pose lost | 腕を 300〜800ms で comfortable pose へ戻す |
| hand lost | 指を half-open / relaxed へ戻す            |
| low fps   | motion strength を自動的に下げる           |
| chat mode | 音声対話用 idle、視線、短い相槌 motion     |

Temporal state estimator では `Tracked`、`Suspect`、`Predicted`、`Lost`、`Recovering` を持ち、dropout 中は予測を減衰させて comfortable pose へ戻す設計が roadmap で示されています。

### 6.3 再試行と設定変更の分岐

| 原因                  | ユーザーに再試行させる | 設定変更を案内する | 自動 fallback |
| --------------------- | ---------------------: | -----------------: | ------------: |
| 肩が入らない          |                    yes |                 no |            no |
| 正面でない            |                    yes |                 no |            no |
| 暗い                  |                    yes |                 no |           yes |
| motion blur           |                    yes |                 no |           yes |
| カメラ権限拒否        |                     no |                yes |          chat |
| カメラなし            |                     no |                yes |          chat |
| 低性能                |                     no |    yes: 軽量モード |     face-only |
| model / wasm 配置漏れ |                     no |                 no |          chat |
| 手だけ失敗            |               optional |                 no |     body sync |

MediaPipe HandLandmarker は video/live stream mode で presence が閾値を下回ると palm detection を再実行し、tracking が成功している場合は検出を skip する状態機械的な挙動を持ちます。手の失敗は body 全体の失敗とは分離し、手だけ `Lost / Recovering` にするのが自然です。([Google for Developers][12])

---

## 7. 最小 UX 仕様

`sincro` を安心して開始できる最小 UX は次です。

```text
Start sincro
  ↓
Camera permission / device check
  ↓
Framing precheck
  ↓
3-step calibration
  ↓
Ready screen
  - 動きの強さ
  - 開始
  - 姿勢を合わせ直す
  ↓
Live sincro
  - 小さな品質ヒント
  - online calibration
  - soft fallback
  ↓
Hard failure only chat mode
```

### 7.1 画面構成

| 画面        | 表示                                                   |
| ----------- | ------------------------------------------------------ |
| precheck    | カメラ preview、肩・顔のガイド枠、主ヒント 1 件        |
| calibration | step instruction、短い countdown、失敗理由 1 件        |
| ready       | 「準備できました」、motion strength、開始              |
| live        | 小さな status badge、必要時のみ guide                  |
| fallback    | 「カメラ同期を一時停止しています。会話は続けられます」 |
| debug       | metrics、raw score、snapshot、fallback reason          |

### 7.2 ユーザー文言の原則

| NG                           | OK                                 |
| ---------------------------- | ---------------------------------- |
| `visibility が低いです`      | `手が見えにくいです`               |
| `borderRisk が高いです`      | `手が画面の端に近いです`           |
| `PoseLandmarker failed`      | `姿勢を読み取れませんでした`       |
| `neutral yaw がずれています` | `正面を向いてください`             |
| `segmentation mask mismatch` | `手や肘が隠れているかもしれません` |

---

## 8. 実装案

### 8.1 追加する型

```ts
type SincroCalibrationStatus =
    | "not_started"
    | "collecting"
    | "ready"
    | "ready_without_hands"
    | "retry_recommended"
    | "failed";

type SincroUserCalibration = {
    version: 1;
    createdAtMs: number;

    neutralTorsoYaw: number;
    neutralTorsoRoll: number;
    neutralHeadYaw: number;
    neutralHeadPitch: number;

    shoulderWidthNorm: number;
    bodyCenterX: number;
    bodyCenterY: number;
    bodyScale: number;

    upperArmLengthNorm?: number;
    lowerArmLengthNorm?: number;
    elbowPlaneHint?: {
        left: number;
        right: number;
    };

    handScale?: {
        left?: number;
        right?: number;
    };

    qualityAtCapture: CameraQualityScore;
};

type CameraQualityScore = {
    frameWidth: number;
    frameHeight: number;
    actualFrameRate: number;

    torsoInFrame: number;
    handsInFrame: {
        left: number;
        right: number;
    };

    faceTooLargeRisk: number;
    borderRisk: number;
    underExposureRisk: number;
    motionBlurRisk: number;
    occlusionRisk: number;
    frontFacingScore: number;

    overall: number;
};

type UserFacingGuide = {
    id:
        | "camera_permission_denied"
        | "camera_not_found"
        | "shoulders_not_visible"
        | "move_back"
        | "face_forward"
        | "hands_near_edge"
        | "hands_too_small"
        | "too_dark"
        | "motion_blur"
        | "arm_occluded"
        | "low_performance";
    severity: "info" | "warning" | "blocking";
    priority: number;
    userText: string;
    debugText: string;
};
```

### 8.2 配置

| モジュール                      | 追加責務                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `features/gaze/trackingRuntime` | `requestVideoFrameCallback` ベースの FrameClock、`getSettings()`、hard failure 正規化 |
| `features/gaze/poseTracking`    | LandmarkReliability、body scale consistency、segmentation optional                    |
| `features/gaze/calibration`     | 初期 calibration state machine、online calibration gate                               |
| `features/gaze/cameraQuality`   | CameraQualityScore、UserFacingGuide 変換                                              |
| `character/retargeting`         | UserCalibration + AvatarMotionProfile を読む                                          |
| `pages/motionDebug`             | calibration / camera / fallback / replay 表示                                         |

`requestVideoFrameCallback()` は新しい video frame が compositor に送られたタイミングで callback を呼び、`mediaTime` や `presentedFrames` を提供します。MDN も video analysis や frame 単位処理の用途を説明しており、`presentedFrames` は missed frame 検出に使えます。([MDNウェブドキュメント][13])

---

## 9. 受け入れ基準

| 項目                      |                                                                    目標 |
| ------------------------- | ----------------------------------------------------------------------: |
| 標準 calibration 完了時間 |                                                                6 秒以内 |
| 通常環境での初回成功率    |                                                            90〜95% 以上 |
| 失敗時の再試行 step       |                                                          失敗 step のみ |
| 同時表示 warning          |                                             主警告 1 件 + 補助 1 件まで |
| 手だけ失敗した場合        |                                                    body sync は開始可能 |
| face-only fallback 遷移   |                                             急停止せず 300〜800ms blend |
| 低性能端末                |                                      lightweight / face-only へ自動降格 |
| debug 再現性              | calibration reason、quality score、fallback reason を replay で確認可能 |
| long session drift        |                         neutral yaw ±10° 以内、shoulder scale ±15% 以内 |

---

## 10. 優先実装順

1. **CameraQualityScore + UserFacingGuide**
   まず camera framing / lighting / border / permission を UX に変換する。これは calibration 前にも live 中にも使える。

2. **3-step calibration state machine**
   `ready / ready_without_hands / retry_recommended / failed` を導入し、失敗 step だけ再試行可能にする。

3. **online calibration gate**
   high reliability + near-neutral のみ EMA 更新し、drift clamp を入れる。

4. **FrameClock の requestVideoFrameCallback 化**
   rAF 駆動から video frame 駆動へ寄せ、timestamp / frame drop / dt を正しく扱う。

5. **debug UI 統合**
   `motionDebug` に CameraQuality、CalibrationStatus、fallback reason、online freeze reason を追加する。

6. **Pose-seeded Hand / Face ROI**
   手が小さい、端に近い、顔に近いケースを改善する。既存 report02 でも Pose を全体検出、Hand / Face を ROI 検出として扱う方針が推奨されています。

---

## 11. 最終提案

`sincro` の calibration UX は、「高精度な身体計測」ではなく、**ユーザーが短時間で自然に始められ、失敗しても自力で直せる同期準備**として設計するべきです。

標準仕様は次で十分です。

```text
通常ユーザー:
  - 4〜5秒の姿勢合わせ
  - 行動ベースの短い案内
  - 動きの強さスライダー
  - 姿勢を合わせ直すボタン
  - 失敗しても chat mode 継続

内部 / debug:
  - CameraQualityScore
  - LandmarkReliability
  - CalibrationStatus
  - OnlineCalibrationGate
  - AvatarMotionProfile
  - fallback reason
  - replay / metrics
```

これにより、既存 roadmap が掲げる「MediaPipe を不確実な観測値として扱い、canonical state、temporal state、motion intent、AvatarMotionProfile を経て VRM normalized pose へ適用する」長期方針と、通常ユーザー向けの簡潔な UX を両立できます。

[1]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[2]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/package.json "Sincromisor/sincromisor-frontend/package.json at main · Sincromisor/Sincromisor · GitHub"
[3]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFrameLoop.ts "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFrameLoop.ts at main · Sincromisor/Sincromisor · GitHub"
[4]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts "Sincromisor/sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts at main · Sincromisor/Sincromisor · GitHub"
[5]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts at main · Sincromisor/Sincromisor · GitHub"
[6]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePosePerformanceGate.ts "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePosePerformanceGate.ts at main · Sincromisor/Sincromisor · GitHub"
[7]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts "Sincromisor/sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts at main · Sincromisor/Sincromisor · GitHub"
[8]: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[9]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md "vrm-specification/specification/VRMC_vrm-1.0/humanoid.md at master · vrm-c/vrm-specification · GitHub"
[10]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia "MediaDevices: getUserMedia() method - Web APIs | MDN"
[11]: https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints "Capabilities, constraints, and settings - Web APIs | MDN"
[12]: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google for Developers"
[13]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback "HTMLVideoElement: requestVideoFrameCallback() method - Web APIs | MDN"
