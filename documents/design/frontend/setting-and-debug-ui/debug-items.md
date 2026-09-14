# デバッグUIの項目一覧

## 要約

診断コンソールの全7タブについて、表示項目と変更操作を列挙する。項目名は画面の原表記、説明は日本語とする。表示と入力範囲の正本は[各Reactパネル](../../../../sincromisor-frontend/src/features/debug/react/panels/)、未取得時の状態は[スナップショット定義](../../../../sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts)で確認する。

## 一覧の読み方

表示専用の項目には設定値の既定値を置かない。調整値の範囲はUI入力の下限・上限・刻みであり、実行時の内部制約と同一とは限らない。既定値は初期設定で、起動後は実行時設定・一般設定・操作結果により更新される。調整は接続済みの実行時処理へ適用を要求する。音声調整の入力はページ別に保存し、再読込後も復元する。

構造と所有者は[デバッグUIの設計](debug-design.md)、通常設定内の状態カードは[設定UIの項目一覧](settings-items.md#接続と画面全体の操作)を参照する。

## 共通操作

| 項目                       | 内容・値                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 右上メニュー               | 「基本設定」「開発者ツール」を排他選択。同じ項目を選ぶと閉じる                                                          |
| `Ctrl+Alt+D`               | 診断コンソールの開閉                                                                                                    |
| 閉じるボタン・外側クリック | 右側パネルを閉じる。メニューにも外側クリック閉じがある                                                                  |
| 接続を停止                 | ヘッダーのボタン。登録されたRTC停止処理を呼び出す                                                                       |
| タブ                       | `Status`、`Audio`、`Messages`、`Gaze`、`Sincro`、`RTC`、`SDP`。初期選択は `Status`                                      |
| 折り畳み                   | `Audio` / `Gaze` の「高度な調整」、音声内の「学習VADチューニング」、`Sincro` の「Pose retarget 調整」。初期は閉じた状態 |

## 全体状態

`Status` タブ。提供元は `snapshot.rtc`、`audio`、`gaze`、`sincroMotion`。すべて表示専用である。

| 画面上の項目      | 内容・表示値                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `ICE Connection`  | ICE接続状態                                                                                         |
| `Signaling`       | シグナリング状態                                                                                    |
| `Round Trip Time` | 往復時間                                                                                            |
| `Mic Level`       | ローカルマイク音量の百分率                                                                          |
| `Remote Audio`    | 受信音声の音量の百分率                                                                              |
| `Local VAD`       | `Speech` / `Silence`                                                                                |
| `Gaze`            | 一時停止時 `paused`、それ以外は注視状態の文字列                                                     |
| `Sincro Face`     | `detected` / `lost` / `off`                                                                         |
| `Sincro Pose`     | `face-only` / `detected` / `lost` / `off`                                                           |
| `DataChannel`     | テキストかテロップのログがあれば `received`、なければ `waiting`。チャネルの接続状態そのものではない |
| `Candidate`       | 選択されたICE候補ペア                                                                               |

## 音声の表示と調整

`Audio` タブ。音声調整の既定値・プリセットは[音声プロファイル](../../../../sincromisor-frontend/src/features/media/userMedia/userMediaAudioProfiles.ts)、UIの初期値はスナップショット定義を参照する。

### 表示専用項目

| 画面上の項目         | 内容・表示値                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Local Mic`          | ローカル音量メーター。表示は0〜100%                                                                                                                                                      |
| `VAD`                | `Speech` / `Silence`                                                                                                                                                                     |
| `Engine`             | 選択方式による `RMS` / `Auto RMS` / `Silero`。実際のモデル稼働は `Model` も確認                                                                                                          |
| `Prob`               | 学習VADの確率0〜100%、未取得・非有限値は `-`                                                                                                                                             |
| `Model`              | `idle` / `loading` / `ready` / `running` / `fallback` / `unavailable`。詳細メッセージはツールチップ                                                                                      |
| `Frames`             | `tx`（送信フレーム数）、`rx`（受信推論数）。未取得時は0                                                                                                                                  |
| `RMS`、`Peak`        | ローカル入力の実効値・ピークを百分率表示                                                                                                                                                 |
| 入力警告             | `Normal` / `Silence` / `Clipping` と状態色                                                                                                                                               |
| `NS/EC/AGC` 適用状態 | ノイズ抑制、エコー除去、自動利得調整の適用状況。詳細はツールチップ。未確認、ON/OFFと次回開始時（`pending`）・反映（`applied`）・未反映（`failed`）を表示。失敗を優先し、反映待ちは警告色 |
| `Remote RTC`         | 受信音量メーター。表示は0〜100%                                                                                                                                                          |

### フィルターとVAD方式

| 画面上の項目・キー                                     | 値・範囲 / 刻み                                           | 既定値・操作条件                     |
| ------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------ |
| `HPF Cutoff` / `filterConfig.highpassHz`               | `60〜300 / 5` Hz                                          | `120`                                |
| LPFを有効化 / `filterConfig.lowpassEnabled`            | 真偽値                                                    | `false`                              |
| `LPF Cutoff` / `filterConfig.lowpassHz`                | `2500〜10000 / 100` Hz                                    | `4200`。LPFオフでも入力は操作可能    |
| 学習VAD（Silero）を有効化 / `vadThresholdMode`         | オンで `learned`、学習方式からオフにすると `manual`       | 方式の既定は `manual`                |
| `Preset`（負荷/精度） / `learnedVadPerformanceMode`    | 標準 `balanced`、低負荷 `low_cpu`、高精度 `high_accuracy` | `balanced`。学習方式以外でも選択可能 |
| 厳格判定（Learned + RMS） / `learnedVadStrictMode`     | 真偽値                                                    | `false`。`learned` のとき操作可能    |
| VAD閾値を自動追従（ノイズフロア） / `vadThresholdMode` | オンで `auto`、オフで `manual`                            | 既定オフ。`learned` 中は操作不可     |
| `VAD RMS Threshold` / `vadRmsThreshold`                | `0.005〜0.2 / 0.001`。表示は百分率                        | `0.015`。`manual` のとき操作可能     |
| `VAD RMS Presets`                                      | 標準 `0.015`、騒音環境 `0.05`、超騒音環境 `0.1`           | `manual` のとき操作可能              |

一般設定の `enableVenueNoiseMode` をオンにするとHPFを180 Hz、LPFをオン・4200 Hz、手動用RMS閾値を0.05、ピーク閾値を0.12へ変更する。手動閾値の即時適用は `manual` 方式に限る。オフでは通常プロファイルへ戻る。ピーク閾値の通常値は0.06で、専用のUI入力はない。無音時の送信抑制を有効にする操作は一般設定の `enableVadGate` にある。

### 学習VADの数値調整

以下は `vadThresholdMode === "learned"` のときだけ操作可能。キーは `learnedVadTuning` のフィールドである。

| 画面上の項目・キー                      | 範囲 / 刻み               | 既定値   |
| --------------------------------------- | ------------------------- | -------- |
| `ON Threshold` / `onThreshold`          | `0.0001〜0.1 / 0.0001`    | `0.0008` |
| `OFF Threshold` / `offThreshold`        | `0.00005〜0.09 / 0.00005` | `0.0004` |
| `Hangover` / `hangoverMs`               | `0〜1200 / 10` ms         | `180`    |
| `Infer Interval` / `minInferIntervalMs` | `20〜400 / 10` ms         | `80`     |

プロファイル選択は上記4値と連続判定フレーム数をまとめて変更する。

| 選択値          | ON / OFF閾値        | 保持時間 / 推論間隔（ms） | ON / OFF連続フレーム数 |
| --------------- | ------------------- | ------------------------- | ---------------------- |
| `balanced`      | `0.0008 / 0.0004`   | `180 / 80`                | `2 / 2`                |
| `low_cpu`       | `0.0012 / 0.0006`   | `160 / 140`               | `2 / 2`                |
| `high_accuracy` | `0.00055 / 0.00025` | `240 / 40`                | `3 / 2`                |

音声入力はページ別JSONの `audio` に保持し、全設定初期化で削除する。保存順序と会場プリセットの優先関係は[音声調整の保存](debug-design.md#音声調整の保存)を参照する。

`onConsecutiveFrames` と `offConsecutiveFrames` に個別入力はない。プロファイルにはスライダーの刻みの倍数でない値もあるため、プリセット値と手動入力の刻みを混同しない。

## メッセージ

`Messages` タブ。すべて表示専用のログである。

| 項目                 | スナップショット・内容                          |
| -------------------- | ----------------------------------------------- |
| `text_ch`            | `rtc.textChannelLog`。テキストチャネル受信ログ  |
| `telop_ch`           | `rtc.telopChannelLog`。テロップチャネル受信ログ |
| `RTC Event Timeline` | `rtc.rtcEventLog`。RTCイベントの時系列ログ      |

## 視線

`Gaze` タブ。表示元は `snapshot.gaze`。初期調整値は[視線プリセット定義](../../../../sincromisor-frontend/src/features/debug/model/debugConsolePublicTypes.ts)の `balanced`。

| 画面上の項目                   | 内容・表示値                                         |
| ------------------------------ | ---------------------------------------------------- |
| カメラプレビュー・目標マーカー | `characterGazeVideo` の映像と `eyeTarget` の位置表示 |
| `Status`                       | 「みてる」「みてない」「停止中」                     |
| `X`、`Y`                       | 顔位置の表示文字列。一時停止時は「停止中」           |
| `Facing`                       | 顔の向きの表示文字列。一時停止時は「停止中」         |
| `Target`                       | 対象選択の診断文字列、初期 `-`、一時停止時「停止中」 |

| 画面上の項目・`tuning` 内のキー    | 範囲 / 刻み        | 既定値   |
| ---------------------------------- | ------------------ | -------- |
| `Hold` / `minimumHoldMs`           | `0〜2000 / 50` ms  | `900`    |
| `Switch Margin` / `switchMargin`   | `0〜0.5 / 0.01`    | `0.15`   |
| `Relink Dist` / `relinkDistance`   | `0.05〜0.5 / 0.01` | `0.2`    |
| `OneEuro Min` / `oneEuroMinCutoff` | `0.1〜4 / 0.1`     | `1.0`    |
| `OneEuro Beta` / `oneEuroBeta`     | `0〜0.2 / 0.005`   | `0.02`   |
| `Deadband` / `deadband`            | `0〜0.02 / 0.0005` | `0.0025` |

プリセットは6入力と `oneEuroDCutoff` を一括更新する。数値の並びは上表の順である。

| 操作                  | 6入力へ設定する値                      | 個別入力のない値       |
| --------------------- | -------------------------------------- | ---------------------- |
| 安定重視 `stable`     | `1400, 0.22, 0.18, 0.8, 0.012, 0.0035` | `oneEuroDCutoff = 1.0` |
| バランス `balanced`   | `900, 0.15, 0.2, 1.0, 0.02, 0.0025`    | `oneEuroDCutoff = 1.0` |
| 追従重視 `responsive` | `450, 0.08, 0.24, 1.4, 0.04, 0.0015`   | `oneEuroDCutoff = 1.0` |

## 顔・姿勢・手の同期

`Sincro` タブの見出しは `Sincro Motion`。表示形式は[整形処理](../../../../sincromisor-frontend/src/features/debug/react/panels/sincroMotionPanelFormatters.ts)に従う。

### 顔の表示

| `Face` 内の項目 | 内容・表示値                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Runtime`       | 追跡処理の実行方式・状態・代替理由、読込時間、転送時間、ワーカー往復時間（ms）、破棄フレーム数                                                         |
| `Status`        | `off` / `fallback` / `detected` / `lost` と理由                                                                                                        |
| `Confidence`    | 顔の信頼度、小数2桁                                                                                                                                    |
| `Head`          | `yaw` / `pitch` / `roll`、度、小数1桁                                                                                                                  |
| `Inference`     | 推論時間（ms）と推論頻度（fps）                                                                                                                        |
| `Updated`       | 最終更新時刻（ms）、未取得時 `-`                                                                                                                       |
| 表情係数        | `eyeBlinkLeft`、`eyeBlinkRight`、`jawOpen`、`mouthSmileLeft`、`mouthSmileRight`、`mouthFunnel`、`mouthPucker`。各0〜1のメーターと数値、未取得の係数は0 |

### 姿勢と手の表示

| `Pose` 内の項目                 | 内容・表示値                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Status`                        | `face-only` と降格理由、または `off` / `fallback` / `detected` / `lost`                                        |
| `Retarget`                      | `active` / `off` / `neutral` と理由。未検出、顔のみ、低信頼度、実行時の利用不可を区別                          |
| `IK`                            | モード、信頼度、左右の解法・重み・制約・代替理由                                                               |
| `CCDIK PoC`                     | 未計測、または左右・状態・理由・スキン付きメッシュ数・正規化骨格と元骨格の検出結果                             |
| `Anchor`                        | 有効/代替、重み、理由、肩の補正量X・Y                                                                          |
| `Avatar Profile`                | 未計測、またはスキーマ版、肩幅、左右上腕・前腕長、頭部サイズ、不足する任意ボーン、警告数                       |
| `Observe Only`                  | 信頼度、正規化、時系列処理、動作意図の各段階の利用可否・理由・媒体時刻・警告数、更新時刻                       |
| `Composer Dry Run`              | 利用可否、全面適用の成功または利用不可理由、警告、抑制された層、制限されたボーン                               |
| `Hand`                          | 利用可否・理由、追跡・検出、左右の検出・由来・開き具合・信頼度・関心領域の警告、媒体時刻、全体警告             |
| `Confidence`                    | 姿勢の信頼度、小数2桁                                                                                          |
| `Upper`                         | 肩の傾き `roll`、体幹の傾き `lean`、肩幅 `width`                                                               |
| `Left Arm`、`Right Arm`         | 追跡喪失時は信頼度。追跡中は上腕の上げ・開き、前腕の曲げ、手首の上げ                                           |
| `Left Targets`、`Right Targets` | 肩・肘・手首それぞれの画面上座標と3次元目標の品質、信頼度、IK利用状態                                          |
| `Left Solver`、`Right Solver`   | IKモード・重み、特徴量適用または代替理由、制約、上腕・前腕・手首の回転（度）、存在する場合は上腕・前腕の四元数 |
| `Lower Targets`                 | 左右の腰・膝・足首の画面上座標と3次元目標の品質、信頼度、IK利用状態                                            |
| `Inference`                     | 推論時間（ms）と推論頻度（fps）                                                                                |
| `Failures`                      | 連続失敗回数                                                                                                   |
| `Updated`                       | 最終更新時刻（ms）、未取得時 `-`                                                                               |

目標点の画面上表示は品質、追跡中の局所X・Y、信頼度、有限座標の有無、IK重み、追跡喪失時の理由を含む。3次元側は座標の有無、品質、基準位置、正規化X・Y・Z、信頼度、IK重み、座標なしの理由を含む。制約表示は理由一覧、重み倍率、正の押し戻し距離である。手の未加工ランドマークや切り抜き画像、合成後の姿勢全体を表示する項目はない。

### 姿勢変換の調整

キーは `sincroMotion.poseRetarget` 内。既定値の正本は[姿勢変換設定](../../../../sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts)の `DEFAULT_SINCRO_POSE_RETARGET_CONFIG`。画面上は追跡状態による入力無効化を行わず、モデルの窓口を通じて接続されたシーンへ適用する。

| 画面上の項目・キー                                           | 選択肢・範囲 / 刻み                                | 既定値        |
| ------------------------------------------------------------ | -------------------------------------------------- | ------------- |
| `IK Mode` / `armIkMode`                                      | `world_3d_ik` / `screen_space_ik` / `feature_only` | `world_3d_ik` |
| `Composer Gesture` / `composerSemanticFingerApplicationMode` | `composer`（semantic/finger composer）/ `off`      | `composer`    |
| `Intensity` / `intensityScale`                               | `0〜1.2 / 0.05`、百分率表示                        | `0.68`        |
| `Min Confidence` / `minConfidence`                           | `0〜1 / 0.05`                                      | `0.45`        |
| `Smoothing` / `smoothingMs`                                  | `40〜800 / 10` ms                                  | `155`         |
| `Neutral Return` / `returnToNeutralMs`                       | `80〜2000 / 20` ms                                 | `520`         |
| `IK Strength` / `armIkStrength`                              | `0〜1 / 0.05`、百分率表示                          | `1.0`         |
| `IK Target Scale` / `armIkTargetScale`                       | `0.2〜1.5 / 0.05`                                  | `1.0`         |
| `Max Lift` / `armIkMaxLiftRad`                               | `0〜π/2 / 0.02` rad、表示は度                      | 34度相当      |
| `Max Open` / `armIkMaxOpenRad`                               | `0〜π/2 / 0.02` rad、表示は度                      | 28度相当      |
| `Max Flex` / `armIkMaxForearmFlexRad`                        | `0〜π/2 / 0.02` rad、表示は度                      | 38度相当      |

一般設定の「姿勢同期」は同じ姿勢変換の強さに関係するが、診断側の変更を一般設定の保存値として扱わない。`Composer Gesture` は意味に基づく動作・指の層の診断用切り戻しであり、腕・体幹・全面適用の旧切り戻し入力は存在しない。

## 通信状態と統計

`RTC` タブ。提供元は `snapshot.rtc`。値は通信側で整形され、未取得の統計は `-` になる。

| 画面上の項目                                      | 内容                         |
| ------------------------------------------------- | ---------------------------- |
| `ICE Gathering`                                   | ICE候補収集状態              |
| `ICE Connection`                                  | ICE接続状態                  |
| `Signaling`                                       | シグナリング状態             |
| `Round Trip Time`                                 | 往復時間                     |
| `Available Out Bitrate`                           | 利用可能な送信ビットレート   |
| `Selected Candidate`                              | 選択された候補ペア           |
| `Transport Protocol`                              | 使用中の転送プロトコル       |
| `Local Endpoint`、`Remote Endpoint`               | ローカル・リモートの候補情報 |
| `Outbound Audio Bitrate`、`Inbound Audio Bitrate` | 音声の送信・受信ビットレート |
| `Outbound Packets Sent`                           | 送信パケット数               |
| `Inbound Packets Lost`                            | 受信側の欠落パケット数       |
| `Inbound Packet Loss`                             | 受信パケット損失率           |
| `Inbound Jitter`                                  | 受信ジッター                 |

| 推移グラフ          | 表示範囲               |
| ------------------- | ---------------------- |
| `Outbound Bitrate`  | 60秒、縦軸上限256 kbps |
| `Inbound Bitrate`   | 60秒、縦軸上限256 kbps |
| `RTT`               | 60秒、縦軸上限200 ms   |
| `Inbound Loss Rate` | 60秒、縦軸上限5%       |

グラフは表示上限で座標を制限する。この値は許容性能の基準ではない。

## セッション記述

`SDP` タブ。`Offer SDP` は `rtc.offerSdp`、`Answer SDP` は `rtc.answerSdp` を表示する。どちらも表示専用で、編集・送信操作はない。
