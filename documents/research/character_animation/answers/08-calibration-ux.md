# 08-calibration-ux.md 調査レポート：`sincro` キャリブレーション / UX ガイド

対象: `sincromisor-frontend` の単眼 Web カメラ上半身モーション同期
前提: MediaPipe Pose / Hand / Face、VRM 1.0、Three.js、three-vrm、VRoid Studio 系モデル
調査時点: 2026-06-14

## 0. 結論

`sincro` モードのキャリブレーション UX は、**短い初期キャリブレーション + 継続的な継続的なキャリブレーション + ユーザーが直せるカメラ品質の案内 + 自然な代替処理動作**として設計するのが最適です。添付依頼では、専門用語をユーザーに見せず、短時間で姿勢同期を開始し、問題時にはユーザーが取れる行動として案内することが重視されています。

推奨方針は次です。

| 領域                       | 推奨                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初期キャリブレーション     | **4〜5秒の 3-step** を標準にする。必須は「正面自然姿勢」「軽い A ポーズ」「軽く開いた手」。顔左右は任意。                                                              |
| T ポーズ                   | 標準 UX では避ける。単眼 Web カメラでは手が画面外に出やすく、肩も不自然になる。                                                                                        |
| 成功判定                   | MediaPipe の検出成功だけでなく、**安定フレーム数、肩・肘・手首の画面内率、画面端にあるリスク、姿勢の揺れ、骨長一貫性**で判定する。                                     |
| 継続的なキャリブレーション | 人間側の観測基準だけを、高信頼度かつ中立姿勢に近い時に低速更新する。アバター構造値、VRM 初期姿勢の回転、骨の長さ、左右判定対応付けは固定。                             |
| カメラ品質 UX              | 内部では数値スコアを持つが、表示は「少し下がってください」「部屋を明るくしてください」のような行動文に変換する。                                                       |
| 通常 UI                    | `開始 / 停止`、カメラ選択、動きの強さ、再キャリブレーション、ヘルプに絞る。                                                                                            |
| デバッグ UI                | 信頼性、未加工の特徴点、カメラスコア、代替処理理由、継続的なキャリブレーション状態、AvatarMotionProfile を表示する。                                                   |
| 失敗時 UX                  | 継続できない失敗はチャットモードへ戻す。機能を制限して継続できる失敗は顔のみ / 待機動作動作 / 無理のない自然姿勢に退避し、同期不能でもキャラクターを不自然に止めない。 |

既存資料の方向性とも整合します。ロードマップでは、MediaPipe 特徴点を直接 VRM ボーンに流すのではなく、ReliabilityMap、CanonicalUpperBodyState、TemporalStateEstimator、MotionIntent、AvatarMotionProfile を挟む構成が目標アーキテクチャとして示されています。 また、VRM 側は three-vrm を人型骨格実行時として扱い、最終姿勢を正規化済み姿勢に集約する方針が妥当です。three-vrm の `getNormalizedPose()` は初期姿勢 / T-pose からのローカル変換を返す設計で、正規化済み姿勢をモデル差分吸収の境界として使う理由があります。 ([Pixiv][1])

---

## 1. 現状リポジトリ観察

公開リポジトリで確認できる範囲では、`sincromisor-frontend` は `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three` を依存に持ち、MediaPipe + three-vrm + Three.js の前提は実装上も一致しています。([GitHub][2])

構成面では、`features/gaze/trackingRuntime` がカメラ / 映像 / Worker / 代替処理の所有境界になっており、`features/gaze/poseTracking` が PoseLandmarker 結果から内部スナップショットを作り、`character/ik` や `character/retargeting` が VRM 向けの後段処理を担う方向です。これは既存取り組み計画が「現行責務境界を活かしつつ中間層を太らせる」としている方針と合っています。

一方で、キャリブレーション / UX ガイド観点では次が未整備または強化余地です。

| 観点             | 現状から見えること                                                                                                                                                   | 推奨する追加                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| FrameClock       | `TrackerRuntimeFrameLoop` は `requestAnimationFrame` で推論ループを回している。([GitHub][3])                                                                         | `requestVideoFrameCallback()` ベースへ移行し、動画フレーム時刻、フレーム破棄、実映像フレーム単位の品質を扱う。 |
| PoseLandmarker   | Pose は `runningMode: "VIDEO"`、`numPoses: 1`、信頼度 0.5、`outputSegmentationMasks: false`。([GitHub][4])                                                           | 領域分割マスクを品質判定用に任意有効化し、遮蔽・背景誤検出・肩欠けを評価する。                                 |
| 代替処理         | Pose 初期化失敗、推論エラー、性能劣化時に顔のみへ機能低下する経路がある。([GitHub][5])                                                                               | ユーザー向け文言、再試行導線、チャットモードへの戻し条件を UX レイヤーで整理する。                             |
| 性能検査         | 連続失敗 18 回、推論遅延警告 4 回などの降格判定がある。([GitHub][6])                                                                                                 | カメラ品質、較正状態、継続的なキャリブレーション更新停止理由を同じ診断用スナップショットに載せる。             |
| スナップショット | `SincroPoseMotionSnapshot` には `confidence`、`inferenceTimeMs`、`inferenceFps`、`consecutiveFailures`、`degradedToFaceOnly`、`fallbackReason` がある。([GitHub][7]) | `CameraQualityScore`、`CalibrationStatus`、`UserFacingGuide[]` を追加する。                                    |

MediaPipe の Web API は `detectForVideo()` が同期実行で UIスレッドをブロックするため、公式ドキュメントでも Worker 利用が推奨されています。現状の Worker 代替処理方針は妥当ですが、UX / 較正の精度を上げるには、単なる fps 制限ではなく「どの映像フレームを評価したか」を保持する必要があります。([Google for Developers][8])

---

## 2. 初期キャリブレーションフロー

### 2.1 標準フロー

標準は **3-step + 任意 1-step** です。既存資料では「正面自然姿勢 + 軽い A ポーズ」が推奨され、T ポーズは手が画面外に出やすく肩も不自然になるため、上半身用途では実用性が低いと整理されています。

| 手順 |      時間 | ユーザー表示                               | 取得値                                       | 失敗時の主な案内                             |
| ---: | --------: | ------------------------------------------ | -------------------------------------------- | -------------------------------------------- |
|    0 | 0.5〜1.0s | 「顔と肩が入る位置にしてください」         | カメラ設定、顔/肩/胴体の画面内率             | 「少し下がって、肩まで画面に入れてください」 |
|    1 |      1.5s | 「正面を向いて、肩の力を抜いてください」   | 中立姿勢体幹、肩幅、頭部中立姿勢、身体の中心 | 「正面を向いてください」                     |
|    2 |      1.5s | 「肘を軽く曲げ、腕を少し開いてください」   | 上腕 / 前腕の長さ、肘平面、腕の可動基準      | 「肘と手首が見えるようにしてください」       |
|    3 |      1.0s | 「手を胸から腰の高さで軽く開いてください」 | 手倍率、指中立姿勢、手のひらの基底補助       | 「手をカメラに見える位置へ移動してください」 |
|    4 | 任意 1.0s | 「顔を少し左右に向けてください」           | 頭部ヨー代替処理                             | 失敗しても開始可能                           |

3-step の合計は 4〜5 秒で、依頼にある 4〜6 秒案の範囲に収まります。 顔左右は必須にしないほうがよく、頭部ヨー代替処理は FaceLandmarker の安定性が低い端末や暗い環境向けの補助値として扱います。

### 2.2 さらに短い手順

短縮版は **2-step / 3〜4秒** です。

| モード   | 内容                         | 用途             | 制限                                     |
| -------- | ---------------------------- | ---------------- | ---------------------------------------- |
| 標準     | 中立姿勢 + A 姿勢 + 手開いた | 推奨デフォルト   | 4〜5秒必要                               |
| 短縮     | 中立姿勢 + A 姿勢            | 初回離脱を減らす | 手・指の中立姿勢は実行中で後追い         |
| 即時開始 | 事前確認のみ                 | プレビュー、デモ | 腕長・手指・正面基準が不安定になりやすい |

本番の `sincro` では標準を推奨します。即時開始は「動きのプレビュー」としてのみ使い、正式な同期開始前には再キャリブレーションを促すべきです。

### 2.3 成功 / 失敗判定

成功判定は「モデルが何かを検出した」ではなく、**一定時間、制御に使える観測が安定していたか**で判定します。MediaPipe Pose は画像座標の特徴点、ワールド座標の特徴点、存在確率、可視性、領域分割マスクを返せるため、これらを直接 UX に出すのではなく信頼性 / カメラ品質に変換します。([Google for Developers][8])

推奨する初期値は次です。実装後、デバッグ再生で調整します。

| 判定カテゴリ       |     ready | 機能低下中 ready |    再試行 |
| ------------------ | --------: | ---------------: | --------: |
| 手順有効時間       | 1.0s 以上 |        0.7s 以上 | 0.7s 未満 |
| 体幹信頼性         | 0.75 以上 |        0.60 以上 | 0.60 未満 |
| 頭部信頼性         | 0.70 以上 |        0.55 以上 | 0.55 未満 |
| 肘 / 手首信頼性    | 0.65 以上 |        0.50 以上 | 0.50 未満 |
| 肩幅 CV            |   8% 未満 |         12% 未満 |  12% 以上 |
| 中立姿勢ヨー       | ±10° 程度 |        ±15° 程度 |  それ以上 |
| 画面端にあるリスク | 0.30 未満 |        0.45 未満 | 0.45 以上 |
| 動体ぶれリスク     | 0.50 未満 |        0.70 未満 | 0.70 以上 |

状態は 4 段階にします。

```ts
type CalibrationStatus =
    | "not_started"
    | "ready"
    | "ready_without_hands"
    | "retry_recommended"
    | "failed";
```

`ready_without_hands` を設けることが重要です。手や指だけが不安定な場合に `sincro` 全体を拒否すると UX が重くなります。腕・肩・頭が使えるなら開始し、手指は代替処理 / 継続的なキャリブレーションで補います。

### 2.4 リトライ UX

失敗時は全体をやり直させず、**失敗した手順だけを再試行**します。

| 状態                   | UX                                                                    |
| ---------------------- | --------------------------------------------------------------------- |
| 画面内に肩が入らない   | 手順 0 に戻す。「肩まで画面に入るように少し下がってください」         |
| A 姿勢で手首が見えない | 手順 2 のみ再実行。「肘と手首が見える位置で、腕を少し開いてください」 |
| 手の手順が失敗         | `ready_without_hands` で開始可。「手の動きはあとで自動調整します」    |
| 暗い / ぶれ            | 手順を止めずに案内を出し、改善後に自動再開                            |
| 何度も失敗             | チャットモード継続 + 再試行ボタン                                     |

警告は最大 2 個です。通常ユーザーには「主警告 1 件 + 小さな補助ヒント 1 件」までにします。デバッグ UI には全理由を表示します。

---

## 3. 継続的なキャリブレーション方針

### 3.1 更新してよい値

継続的なキャリブレーションは、**人間側の観測基準の低速更新**に限定します。既存取り組み計画でも、AvatarMotionProfile / 較正では VRM 読み込み時に初期姿勢のローカル回転、骨の長さ、肩幅、頭部大きさ、任意ボーンを計測し、初期較正は中立姿勢 + A 姿勢、継続的なキャリブレーションは高信頼度・中立姿勢に近い時だけ肩幅や中立姿勢ヨーを低速更新する方針です。

| 値                              | 更新可否   | 条件                                           |
| ------------------------------- | ---------- | ---------------------------------------------- |
| 体幹中心                        | 可         | 体幹信頼性高、画面中央付近、急な移動なし       |
| 観測値肩幅                      | 可         | 両肩が見える、正面、腕が下がっている           |
| 中立姿勢体幹ヨー / ロール微修正 | 可         | Face と肩線が整合、中立姿勢に近い              |
| 頭部中立姿勢補正量              | 可         | FaceLandmarker 高信頼度、顔が正面に近い        |
| カメラ身体寸法の倍率            | 可         | 肩幅・顔サイズ・体幹囲み領域が安定             |
| 手開いた基準値                  | 可         | 手が画面中央、手信頼性高、開き手が一定時間継続 |
| 指の曲げ中立姿勢                | 条件付き可 | HandLandmarker が安定している場合のみ          |

### 3.2 更新してはいけない値

| 値                           | 固定理由                                                             |
| ---------------------------- | -------------------------------------------------------------------- |
| VRM 骨の長さ                 | アバター構造値であり、ユーザー姿勢で変えるとモデル差分吸収が破綻する |
| VRM 初期姿勢の回転補正量     | 動的に変えると正規化済み姿勢の意味が変わる                           |
| 人型骨格ボーン対応付け       | VRM 1.0 の構造定義に属する                                           |
| 左右判定対応付け             | 実行中で揺らすと左右入れ替え事故になる                               |
| 関節可動域制限               | 推定誤差に追従して破綻を許容してしまう                               |
| 手のひらの基底軸定義         | 実装規約であり、観測ごとに変えるべきではない                         |
| AvatarMotionProfile の構造値 | デバッグ / 調整情報編集でのみ変更する                                |

VRM 1.0 の人型骨格は humanBones 対応付けを持ち、必須ボーンと任意ボーンの差分があります。人型骨格に属さないノードが人型骨格ボーンの間に挟まることも許容されるため、モデル構造値は実行時較正ではなく AvatarMotionProfile 側で扱うべきです。([GitHub][9])

### 3.3 更新速度

継続的なキャリブレーションは EMA で実装し、時間定数を明示します。既存 report02 でも、高信頼度・中立姿勢に近い時のみ `lerp(..., 0.001)` のような低速更新が例示されています。

| 値                    | 推奨時定数 | 目安                             |
| --------------------- | ---------: | -------------------------------- |
| 体幹中心              |    20〜60s | 椅子位置の微変化へ追従           |
| 肩幅 / 身体寸法の倍率 |   60〜180s | 徐々に生じるずれ防止を優先       |
| 中立姿勢ヨー / ロール |   60〜120s | 常時斜めになる問題をゆっくり補正 |
| 頭部中立姿勢          |    30〜90s | 首の傾き補正                     |
| 手開いた基準値        |    10〜30s | 手指は環境差が大きいためやや速め |
| カメラ品質移動平均    |      1〜3s | UX 表示用。ちらつき抑制          |

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

### 3.4 中立姿勢に近い判定

継続的なキャリブレーションの検査は次を全て満たす場合だけ開きます。

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

| 状態       | 判定                                                         | 処理                                   |
| ---------- | ------------------------------------------------------------ | -------------------------------------- |
| 実姿勢変化 | 複数関節が一貫して移動、信頼度高、骨の長さ一貫、速度連続     | 状態推定として追従。較正は急更新しない |
| 推定外れ   | 1〜2 関節だけ急ジャンプ、信頼度低下、画面端、骨の長さ崩れ    | 信頼性を下げ、較正更新を更新停止       |
| カメラ移動 | 顔・肩・体幹囲み領域全体が同方向に移動、倍率も変化           | カメラ・身体倍率を低速更新             |
| 遮蔽       | 領域分割 / 可視性 / 画面端にあるリスク悪化、手や肘だけ消える | 該当部位だけ Predicted / Lost へ遷移   |

既存資料でも、信頼性は存在確率 / 可視性 / 追跡信頼度だけでなく、画面端、骨の長さ、時系列整合性、左右整合性を合成する方針が示されています。

### 3.5 徐々に生じるずれ検査

徐々に生じるずれ防止のため、継続的なキャリブレーションは初期値からの逸脱範囲を持ちます。

| 値                          |              推奨値の制限 |
| --------------------------- | ------------------------: |
| 観測値肩幅                  |               初期値 ±15% |
| 身体寸法の倍率              |               初期値 ±20% |
| 中立姿勢体幹ヨー            |            初期値 ±8〜10° |
| 中立姿勢頭部ピッチ / ロール |            初期値 ±8〜10° |
| 手倍率                      |               初期値 ±20% |
| カメラ中心                  | 画面幅 / 高さの ±15% 程度 |

加えて、`candidate` と `committed` の 2 段階に分けます。短期観測は `candidate` に蓄積し、3〜5 秒以上安定した場合だけ `committed` に反映します。

---

## 4. カメラ品質の案内文言集

内部では `CameraQualityScore` を持ち、通常 UI では「ユーザーが直せる行動」に変換します。report02 では `frameWidth`、`frameHeight`、`actualFrameRate`、`torsoInFrame`、`handsInFrame`、`motionBlurRisk`、`underExposureRisk`、`borderRisk` を含む `CameraQualityScore` が提案されています。

| 優先度 | 問題                 | 通常ユーザー向け文言                                         | デバッグ表示                                      | 推奨アクション                |
| -----: | -------------------- | ------------------------------------------------------------ | ------------------------------------------------- | ----------------------------- |
|      1 | カメラ権限なし       | カメラの使用を許可してください。                             | `getUserMedia: NotAllowedError`                   | ブラウザ権限案内              |
|      1 | カメラなし           | 使用できるカメラが見つかりません。                           | `getUserMedia: NotFoundError`                     | カメラ選択欄 / チャットモード |
|      1 | 肩が入っていない     | 肩まで画面に入るように、少し下がってください。               | `torsoInFrame < threshold`, 肩可視性低い          | 較正停止                      |
|      1 | 顔だけ大きい         | 少し離れて、胸のあたりまで入れてください。                   | 顔の囲み領域が大きすぎる、肩幅が広すぎる          | 較正停止                      |
|      2 | 正面を向いていない   | 正面を向いてください。                                       | 顔ヨー / 肩ヨー高い                               | 中立姿勢手順再試行            |
|      2 | 手や肘が隠れている   | 肘と手が見えるようにしてください。                           | 肘 / 手首信頼性低い, 遮蔽リスク                   | A 姿勢再試行                  |
|      2 | 露出不足             | 部屋を明るくしてください。                                   | 低い輝度, 信頼度破棄                              | 制限して継続停止              |
|      3 | 動体ぶれ             | ゆっくり動くか、部屋を明るくしてください。                   | 高い特徴点速度, ぶれリスク                        | 警告                          |
|      3 | 手が画面端に近い     | 手が画面の端に近いです。少し中央へ移動してください。         | 左・右 borderRisk 高い                            | 手機能低下中                  |
|      4 | 手が小さく写っている | 手が見えにくいです。胸から腰の高さでカメラに見せてください。 | 手外接矩形 / 手のひらが占める範囲小さい, ROI 失敗 | 手任意再試行                  |

`getUserMedia()` は安全なコンテキストとユーザー許可が必要で、権限拒否やカメラ未検出などは `NotAllowedError`、`NotFoundError`、`NotReadableError`、`OverconstrainedError` などとして扱われます。これらはユーザーが直せる場合と直せない場合があるため、継続できない失敗の文言はカメラ品質警告と分けるべきです。([MDNウェブドキュメント][10])

表示優先順位は次です。

```text
継続できない失敗
  > 身体画面内の構図
  > 正面向き・遮蔽
  > 照明 / ぶれ
  > 手が画面端にある・手が小さい
  > 診断専用の詳細
```

通常 UI では「今直すべき 1 件」だけを帯状の案内表示し、2 件目は小さな補助ヒントに留めます。デバッグ UI では全理由とスコアを一覧表示します。

---

## 5. 設定 UI

### 5.1 通常 UI に出すべき項目

通常 UI は最小にします。

| 項目                 | 表示名                   |   初期値 | 理由                                 |
| -------------------- | ------------------------ | -------: | ------------------------------------ |
| 開始 / 停止          | `sincro を開始` / `停止` |        - | 明確な主操作                         |
| カメラ選択欄         | `カメラ`                 | 既定機器 | 複数カメラ対応                       |
| 再キャリブレーション | `姿勢を合わせ直す`       |        - | 環境変化への逃げ道                   |
| 動きの強さ           | `動きの強さ`             | 60 / 100 | キャラ差・好みを単一スライダーで吸収 |
| 軽量モード           | `軽量モード`             |     自動 | 低性能端末向け                       |
| ヘルプ               | `うまく動かないとき`     |        - | カメラ案内表示                       |

### 5.2 デバッグ UI にだけ出す項目

| カテゴリ  | 項目                                                                             |
| --------- | -------------------------------------------------------------------------------- |
| カメラ    | `getSettings()`、実際の幅 / 高さ / fps、フレーム破棄、rVFC メタデータ            |
| MediaPipe | モデルパス、wasm パス、実行方式、detect 時間、信頼度、領域分割有効・無効         |
| 信頼性    | 関節 / 部位重み、存在確率、可視性、画面端、骨長の整合性、時系列予測と観測の差    |
| 較正      | 現在の状態、手順理由、実行中検査、更新停止理由、EMA 値、徐々に生じるずれ値の制限 |
| アバター  | AvatarMotionProfile、骨の長さ、任意ボーン、到達距離倍率、奥行き圧縮、肩減衰      |
| 代替処理  | degradedToFaceOnly、fallbackReason、性能検査理由、チャットモード代替処理理由     |
| 再生      | 未加工の結果記録、最終姿勢、評価指標、再生操作部品                               |

メディア記録 API では制約は要求値であり、実際の設定は `MediaStreamTrack.getSettings()` で確認する必要があります。したがって、デバッグ UI では要求制約と実際の設定を分けて表示します。([MDNウェブドキュメント][11])

### 5.3 動きの強さスライダーで吸収できる範囲

動きの強さは「推定の正しさ」ではなく「キャラクター表現の強さ」を変えるスライダーにします。

| 内部値           | 動きの強さ低 | 標準 |   高 |
| ---------------- | -----------: | ---: | ---: |
| 腕到達距離倍率   |         0.75 | 0.90 | 1.00 |
| 左右方向開き具合 |         0.70 | 0.90 | 1.05 |
| 奥行き反映率     |         0.35 | 0.55 | 0.70 |
| 胸追従           |         0.25 | 0.45 | 0.65 |
| 手首ロール反映率 |         0.20 | 0.40 | 0.55 |
| 指表情           |         0.50 | 0.80 | 1.00 |

吸収できないものは、カメラ品質の案内に回します。例えば、肩が入っていない、部屋が暗い、手が隠れている、モデル / wasm が読み込めない、といった問題はスライダーでは解決しません。

### 5.4 キャラクター別調整情報を見せるべきか

通常 UI では見せないほうがよいです。表示する場合は「このキャラクターの動きをリセット」程度に留めます。

内部的には `AvatarMotionProfile` をキャラクターごとに保存します。取り組み計画では、VRM 読み込み時に初期姿勢のローカル回転、骨の長さ、肩幅、頭部大きさ、任意ボーンを計測し、到達距離倍率、奥行き圧縮、肘外向き偏りの補正、肩減衰、手首ロール反映率を持たせる方針が示されています。

---

## 6. 失敗時代替処理 UX

### 6.1 `sincro` を無効化してチャットモードへ戻す条件

| 条件                             | 分類         | UX                                                           |
| -------------------------------- | ------------ | ------------------------------------------------------------ |
| カメラ権限拒否                   | 継続不可     | チャットモード継続。「カメラを許可すると sincro を使えます」 |
| カメラなし                       | 継続不可     | チャットモード継続。カメラ選択 / 接続案内                    |
| 安全でないコンテキスト           | 継続不可     | チャットモード継続。環境側の問題として表示                   |
| MediaPipe モデル / wasm 配置漏れ | 継続不可     | チャットモード継続。ユーザーでは直せないため短く通知         |
| Face / Pose 実行時全体エラー     | 継続不可     | チャットモード継続 + デバッグにエラー                        |
| Pose のみ初期化失敗              | 制限して継続 | 顔のみ + 待機動作上半身                                      |
| Pose 推論が遅すぎる              | 制限して継続 | 顔のみ / 軽量モード                                          |
| 肩が入らない                     | 制限して継続 | 較正停止、画面内の構図案内                                   |
| 手だけ見えない                   | 制限して継続 | 身体の同期継続、手代替処理                                   |
| 暗い / ぶれ                      | 制限して継続 | 警告 + 信頼度低下、改善待ち                                  |

現状実装にも、Pose 初期化失敗や推論中エラー、性能検査によって顔のみに機能低下する経路があります。([GitHub][5]) これを UX レイヤーでは「故障」ではなく「カメラなしでも会話は継続できます」という自然なフォールバックに変換します。

### 6.2 代替処理中の動作

代替処理中に避けるべきなのは、キャラクターが突然 T-pose / 無表情 / 完全停止になることです。既存資料でも、最適化対象は人体忠実性より「破綻しない」「安定している」「キャラクターとして自然」が優先とされています。

推奨代替処理動作:

| 状態           | 動作                                       |
| -------------- | ------------------------------------------ |
| 顔のみ         | 顔向き、軽い頷き、呼吸、肩の微小揺れ       |
| 姿勢未検出     | 腕を 300〜800ms で無理のない自然姿勢へ戻す |
| 手未検出       | 指を半開き / 力を抜いたへ戻す              |
| 低い fps       | 動きの強さを自動的に下げる                 |
| チャットモード | 音声対話用待機動作、視線、短い相槌動作     |

時系列状態推定処理では `Tracked`、`Suspect`、`Predicted`、`Lost`、`Recovering` を持ち、一時欠損中は予測を減衰させて無理のない自然姿勢へ戻す設計が取り組み計画で示されています。

### 6.3 再試行と設定変更の分岐

| 原因                   | ユーザーに再試行させる | 設定変更を案内する | 自動代替処理 |
| ---------------------- | ---------------------: | -----------------: | -----------: |
| 肩が入らない           |                   はい |             いいえ |       いいえ |
| 正面でない             |                   はい |             いいえ |       いいえ |
| 暗い                   |                   はい |             いいえ |         はい |
| 動体ぶれ               |                   はい |             いいえ |         はい |
| カメラ権限拒否         |                 いいえ |               はい |     チャット |
| カメラなし             |                 いいえ |               はい |     チャット |
| 低性能                 |                 いいえ |   はい: 軽量モード |       顔のみ |
| モデル / wasm 配置漏れ |                 いいえ |             いいえ |     チャット |
| 手だけ失敗             |                   任意 |             いいえ |   身体の同期 |

MediaPipe HandLandmarker は映像・実時間のストリームモードで存在確率が閾値を下回ると手のひら検出を再実行し、追跡が成功している場合は検出を省略する状態機械的な挙動を持ちます。手の失敗は身体全体の失敗とは分離し、手だけ `Lost / Recovering` にするのが自然です。([Google for Developers][12])

---

## 7. 最小 UX 仕様

`sincro` を安心して開始できる最小 UX は次です。

```text
sincroを開始
  ↓
カメラ権限 / 機器確認
  ↓
構図の事前確認
  ↓
3段階のキャリブレーション
  ↓
準備完了画面
  - 動きの強さ
  - 開始
  - 姿勢を合わせ直す
  ↓
実時間の sincro
  - 小さな品質ヒント
  - 継続的なキャリブレーション
  - 制限して継続代替処理
  ↓
継続できない失敗の場合だけchatモードへ戻る
```

### 7.1 画面構成

| 画面     | 表示                                                   |
| -------- | ------------------------------------------------------ |
| 事前確認 | カメラプレビュー、肩・顔のガイド枠、主ヒント 1 件      |
| 較正     | 手順案内、短い秒読み、失敗理由 1 件                    |
| ready    | 「準備できました」、動きの強さ、開始                   |
| 実時間の | 小さな状態バッジ、必要時のみ案内                       |
| 代替処理 | 「カメラ同期を一時停止しています。会話は続けられます」 |
| デバッグ | 評価指標、未加工スコア、スナップショット、代替処理理由 |

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

| モジュール                      | 追加責務                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `features/gaze/trackingRuntime` | `requestVideoFrameCallback` ベースの FrameClock、`getSettings()`、継続できない失敗正規化 |
| `features/gaze/poseTracking`    | LandmarkReliability、身体寸法の倍率整合性、領域分割任意                                  |
| `features/gaze/calibration`     | 初期較正状態機械、継続的なキャリブレーション検査                                         |
| `features/gaze/cameraQuality`   | CameraQualityScore、UserFacingGuide 変換                                                 |
| `character/retargeting`         | UserCalibration + AvatarMotionProfile を読む                                             |
| `pages/motionDebug`             | 較正 / カメラ / 代替処理 / 再生表示                                                      |

`requestVideoFrameCallback()` は新しい映像フレームが画面合成処理に送られたタイミングでコールバックを呼び、`mediaTime` や `presentedFrames` を提供します。MDN も映像解析やフレーム単位処理の用途を説明しており、`presentedFrames` は取りこぼしたフレーム検出に使えます。([MDNウェブドキュメント][13])

---

## 9. 受け入れ基準

| 項目                               |                                               目標 |
| ---------------------------------- | -------------------------------------------------: |
| 標準較正完了時間                   |                                           6 秒以内 |
| 通常環境での初回成功率             |                                       90〜95% 以上 |
| 失敗時の再試行手順                 |                                       失敗手順のみ |
| 同時表示警告                       |                        主警告 1 件 + 補助 1 件まで |
| 手だけ失敗した場合                 |                               身体の同期は開始可能 |
| 顔のみ代替処理遷移                 |                         急停止せず 300〜800ms 合成 |
| 低性能端末                         |                            軽量 / 顔のみへ自動降格 |
| デバッグ再現性                     | 較正理由、品質スコア、代替処理理由を再生で確認可能 |
| 長時間のセッション徐々に生じるずれ |           中立姿勢ヨー ±10° 以内、肩倍率 ±15% 以内 |

---

## 10. 優先実装順

1. **CameraQualityScore + UserFacingGuide**
   まずカメラ画面内の構図 / 照明 / 画面端 / 権限を UX に変換する。これは較正前にも実時間の中にも使える。

2. **3段階のキャリブレーション状態機械**
   `ready / ready_without_hands / retry_recommended / failed` を導入し、失敗手順だけ再試行可能にする。

3. **継続的なキャリブレーション検査**
   高い信頼性 + 中立姿勢に近いのみ EMA 更新し、徐々に生じるずれ値の制限を入れる。

4. **FrameClock の requestVideoFrameCallback 化**
   rAF 駆動から映像フレーム駆動へ寄せ、時刻 / フレーム破棄 / dt を正しく扱う。

5. **デバッグ UI 統合**
   `motionDebug` に CameraQuality、CalibrationStatus、代替処理理由、実行中更新停止理由を追加する。

6. **Poseを手がかりにした Hand / Face ROI**
   手が小さい、端に近い、顔に近いケースを改善する。既存 report02 でも Pose を全体検出、Hand / Face を ROI 検出として扱う方針が推奨されています。

---

## 11. 最終提案

`sincro` の較正 UX は、「高精度な身体計測」ではなく、**ユーザーが短時間で自然に始められ、失敗しても自力で直せる同期準備**として設計するべきです。

標準仕様は次で十分です。

```text
通常ユーザー:
  - 4〜5秒の姿勢合わせ
  - 行動ベースの短い案内
  - 動きの強さスライダー
  - 姿勢を合わせ直すボタン
  - 失敗してもチャットモード継続

内部 / デバッグ:
  - CameraQualityScore
  - LandmarkReliability
  - CalibrationStatus
  - OnlineCalibrationGate
  - AvatarMotionProfile
  - 代替処理理由
  - 再生 / 評価指標
```

これにより、既存取り組み計画が掲げる「MediaPipe を不確実な観測値として扱い、標準状態、時系列状態、動作意図、AvatarMotionProfile を経て VRM 正規化済み姿勢へ適用する」長期方針と、通常ユーザー向けの簡潔な UX を両立できます。

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
