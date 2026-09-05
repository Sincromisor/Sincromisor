# 調査レポート：sincromisor-frontend 時系列推定 / フィルタ / レイテンシ設計

対象は、`sincro` モードにおける **MediaPipe 由来の細かな揺れ、欠落、外れ値、再検出ジャンプを抑えつつ、低遅延なVRM上半身モーションを生成する時系列処理**です。添付 `03-temporal-filtering.md` は、単純な平滑化ではなく、部位別信頼性を持つ観測値から身体のローカル座標系での標準状態と最終 VRM 姿勢を安定化する「状態推定」として整理することを求めています。手・頭の体感遅延はおおむね100ms前後以内、胴体は安定重視という目標が明示されています。

## 0. 結論

現行の `sincromisor-frontend` には、時系列処理を拡張するための足場は既にあります。`features/gaze/trackingRuntime`、`features/gaze/poseTracking`、`character/retargeting`、`character/ik`、`pages/motionDebug` という責務境界があり、添付ロードマップでもこれらを破棄せず、`FrameClock`、`ReliabilityMap`、`CanonicalUpperBodyState`、`TemporalStateEstimator`、`MotionDebugRecorder` などを追加する方針が示されています。

ただし、現行実装の時系列処理は、主に **動作の変換フレームへのグローバルな平滑化 / 中立姿勢代替処理** に寄っています。`SincroPoseRetargeter` には `smoothingMs` と `returnToNeutralMs` があり、既定値は `smoothingMs: 155`、`returnToNeutralMs: 520`、`minConfidence: 0.45` です。また `smoothFrame()` は数値成分の線形補間とクォータニオン `slerp` を使う構成です。これは安定化の初期実装としては妥当ですが、03番の調査依頼が求める **部位別状態遷移、欠落予測、再検出復帰、信頼度を考慮したフィルタ処理** には不足しています。([GitHub][1])

推奨する次段階は、`smoothingMs` をさらに調整することではなく、次の層を `poseTracking` と `retargeting` の間に追加することです。

```text
MediaPipe 結果
  -> SincroPoseMotionSnapshot / 未加工の観測値
  -> ReliabilityMap
  -> 身体のローカル座標系のCanonicalUpperBodyState
  -> TemporalStateEstimator
       - One Euro Filter
       - Kalman 等速度予測
       - DropoutStateMachine
       - Hysteresis / 短時間の変化の抑制
       - クォータニオンの対数空間での平滑化
  -> 動作の変換 / IK / VRM 正規化済みのローカル回転
```

この方向性は、添付資料群の「MediaPipe 特徴点を直接 VRM ボーンへ流さず、不確実な観測値として扱う」という基本方針と一致します。

---

## 1. 現行実装の確認

`sincromisor-frontend` は `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、React、Vite、TypeScript を使用しています。`package.json` 上では `@mediapipe/tasks-vision` が `^0.10.34`、`@pixiv/three-vrm` が `^3.5.1`、`three` が `^0.182.0` です。([GitHub][2])

関連するディレクトリ構成は、今回の追加実装に適した分割になっています。`src/features/gaze` には `faceTracking`、`poseTracking`、`trackingRuntime` があり、`src/character` には `ik` と `retargeting` があり、`src/pages` には `motionDebug` と `poseLandmarkerSpike` が存在します。([GitHub][3])

### 1.1 実行時 / 実行頻度

現行の `TrackerRuntimeFrameLoop` は `requestAnimationFrame` を使うフレームループで、実行頻度判定は `performance.now()` と目標fpsに基づいています。既定値は全体の目標推論 fps が15、姿勢推論 fps が12です。([GitHub][4])

この構成では、カメラ映像フレームの時刻と推論時刻が必ずしも一致しません。`HTMLVideoElement.requestVideoFrameCallback()` は、新しい映像フレームが画面合成処理に送られるタイミングで呼ばれ、`mediaTime`、`presentationTime`、`presentedFrames` などのメタデータを取得できます。`presentedFrames` は取りこぼしたフレーム検出に利用できます。([MDN Web 文書][5])

したがって、03番のテーマでは、まず `FrameClock` を `requestVideoFrameCallback` 基準へ移行し、未対応環境だけ `requestAnimationFrame` 代替処理にするべきです。これにより、One Euro Filter やカルマンフィルタの `dt` が映像フレーム基準になり、追加遅延と欠落フレームを計測できます。

### 1.2 Pose 追跡 / スナップショット

現行の `SincroPoseTracker` は MediaPipe `PoseLandmarker.detectForVideo(videoFrame, timestampMs)` を使い、`runningMode: "VIDEO"`、`numPoses: 1`、信頼度閾値0.5、`outputSegmentationMasks: false` で Pose Landmarker を構成しています。([GitHub][6])

MediaPipe Pose Landmarker は身体姿勢特徴点と3D ワールド座標の特徴点を返し、`VIDEO` モードでは `detectForVideo()` を使います。Web版の `detect()` / `detectForVideo()` は同期実行でUIスレッドをブロックするため、公式ドキュメントでも Web Worker の使用が推奨されています。([Google for Developers][7])

`SincroPoseTrackerNormalizer` は、肩可視性の不足時に代替処理を返し、肩幅、体幹傾き、肩ロール、腕動作などの低振幅スナップショットへ正規化しています。`SincroPoseMotionSnapshot` には `targetQuality`、`confidence`、`visibility`、`presence`、`usableForIk`、`ikWeight`、`stale`、ワールド座標基準点などが含まれます。これは明示的な `ReliabilityMap` を導入する土台として有用です。([GitHub][8])

### 1.3 動作の変換 / IK / 平滑化

`SincroPoseRetargeter` は、姿勢が未検出 / 低信頼度の場合に中立姿勢フレームへ戻し、`smoothingMs` に基づいて動作の変換フレームを平滑化します。腕については `SincroPoseArmRetargeter` が特徴量に基づく腕と IK 腕を合成し、`world_3d_ik` / `screen_space_ik` のモードを持っています。([GitHub][9])

現行の `character/ik` には `sincroArmIkSolver`、`sincroArmIkPole`、`sincroArmIkConstraint` などが存在し、`character/retargeting` には `sincroPoseArmIkSolve`、`sincroPoseArmRetargeter`、`sincroPoseRetargetFrame` などが存在します。つまり、IK本体を大きく作り直す前に、IK 目標 / 曲がる方向 / 手首ロールへ渡す前段の時系列推定を追加するのが合理的です。([GitHub][10])

### 1.4 motionDebug

`motionDebug` にはカメラストリーム、映像入力元、フレーム取得、姿勢重ね表示、デバッグ API があり、`getSnapshot`、`captureFrame`、`loadVideoFixture` などの機能が存在します。([GitHub][11])

ただし、添付ロードマップが求める「同一入力ログから同一動作の変換結果を再現し、中立姿勢での細かな揺れ、肘の反転回数、復帰時の急変、角速度の急増、到達距離制限の発生率を計測する」段階にはまだ達していません。最初に記録・再生・評価指標基盤を作るべき、というロードマップ上の優先順位は妥当です。

---

## 2. フィルタの使い分け

03番の依頼では、EMA、One Euro Filter、カルマンフィルタ、クォータニオンの対数空間での平滑化、ヒステリシスの使い分けが論点になっています。結論として、この分類は妥当です。ただし、「全特徴点に同じフィルタをかける」設計ではなく、**信頼度つき標準化した制御に対する部位別状態推定処理** として実装するべきです。添付 report02 でも、時系列処理は未加工の特徴点座標への単純平滑化ではなく、複数段の状態推定として扱うべきとされています。

| 手法                               | 主用途                                                                           | 採用判断                                       |
| ---------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| EMA                                | カメラ品質、信頼性スコア、継続的なキャリブレーション、UI表示、低速な中立姿勢補正 | 採用。ただし手先・頭の主平滑化には使いすぎない |
| One Euro Filter                    | 手首目標、頭部回転、標準化したスカラー、指の曲げの低遅延細かな揺れ抑制           | 主採用                                         |
| カルマンフィルタ                   | 一時欠損中の予測、再検出時の復帰、速度の減衰                                     | 手・肘・頭に限定して採用                       |
| クォータニオンの対数空間での平滑化 | 最終ボーン回転、頭部 / 胸 / 手首ロールの短い仕上げ平滑化                         | 採用。既存 slerp 平滑化の上位互換として導入    |
| ヒステリシス / 短時間の変化の抑制  | ジェスチャー表示名、開いた / 終了、前出し具合 / 開き具合、状態遷移               | 必須                                           |

One Euro Filter は、低速時には遮断周波数を下げて細かな揺れを抑え、高速時には遮断周波数を上げて遅れを減らす速度適応型低域通過フィルタです。原論文では、最小遮断周波数と速度係数速度係数の2つの主要パラメータで細かな揺れと遅れのトレードオフを調整する方法が示されています。

One Euro Filter の実用上の調整は、まず `beta = 0` で低速時の細かな揺れが消えるように `minCutoff` を決め、その後、速い動きの遅れが許容範囲に入るまで `beta` を上げる手順が基本です。([Géry Casiez][12])

カルマンフィルタは、常時すべての値を滑らかにするためではなく、**観測欠落中の短期予測と、再検出時の観測値への復帰** に使うべきです。添付 report02 でも、`position`、`velocity`、`covariance` を持つ等速度モデルとし、観測ノイズを信頼性に応じて変える方式が提案されています。

---

## 3. 部位別フィルタ設計

下表は、添付 report03 の既存パラメータ案を出発点に、現行実装の `smoothingMs: 155` が手・頭にはやや重く、胴体には妥当である点を加味して再整理した初期値です。既存資料では、One Euro Filter の目安として体幹 `minCutoff 0.5〜0.8`、頭部 `1.0〜1.8`、手首 `1.5〜2.5`、指の曲げ `3.0〜6.0` などが示されています。

前提として、`minCutoff` は Hz、`beta` は入力スケール依存です。手首目標は肩幅または体幹長で正規化した身体のローカル座標系の座標、角度系はラジアンで内部表現する想定です。

| 部位              |                                    主フィルタ | One Euro `minCutoff` |     `beta` | 欠落予測                            |   復帰合成 | 追加遅延目標 | 備考                                          |
| ----------------- | --------------------------------------------: | -------------------: | ---------: | ----------------------------------- | ---------: | -----------: | --------------------------------------------- |
| 体幹回転          | One Euro + クォータニオンの対数空間での平滑化 |           0.45〜0.75 | 0.03〜0.12 | 基本保持 + 中立姿勢減衰             | 500〜900ms |   100〜150ms | 胴体細かな揺れは最優先で抑える                |
| 胸 / `upperChest` |                        One Euro +分配後平滑化 |             0.7〜1.1 | 0.05〜0.18 | 保持 + 低速減衰                     | 400〜700ms |    80〜130ms | 肩 / 腕の補正と連動                           |
| 頭部回転          | One Euro + クォータニオンの対数空間での平滑化 |             1.2〜1.8 | 0.12〜0.35 | Kalman / 保持                       | 200〜400ms |     50〜95ms | Face 行列がある場合は主入力にする             |
| 手首目標          |                          One Euro + Kalman CV |             1.8〜2.8 | 0.25〜0.70 | 等速度 + 減衰                       | 180〜320ms |     45〜85ms | 手先は反応性重視                              |
| 肘の曲がる方向    |                       One Euro + 外れ値の除外 |             0.7〜1.3 | 0.02〜0.15 | 前フレームの値曲がる方向 + 代替処理 | 250〜450ms |    80〜140ms | 反転防止を最優先                              |
| 手首ロール        |            強め One Euro + クォータニオンログ |            0.45〜1.0 | 0.02〜0.12 | 保持 + 中立姿勢ロール減衰           | 250〜500ms |    90〜160ms | 手のひらの基底の信頼度が低い時は抑制          |
| 指の曲げ          |                       One Euro + ヒステリシス |             3.0〜6.5 | 0.30〜1.20 | 表示名 / 曲げ保持                   | 100〜200ms |     25〜55ms | 3D指回転ではなく曲げ / 指の開きを主表現にする |
| ジェスチャー状態  |             ヒステリシス / 短時間の変化の抑制 |               不使用 |     不使用 | 表示名保持                          | 120〜300ms |    50〜150ms | 最短2〜3フレーム継続で確定                    |

指については、Hand Landmarker の21点を各指ボーンの3D回転へ直接変換するのではなく、`curl`、`spread`、`oppose` のような低次元表現へ落とす方が安定します。添付 report01 でも、指は「各関節の3D回転」ではなく `curl / splay` として扱う方針が示されています。

---

## 4. 状態遷移設計

部位ごとに状態機械を分けるべきです。手首、指、頭、胴体では、欠落頻度、許容遅延、見た目上の破綻度が異なるためです。03番で提示されている次の状態遷移は妥当です。

```text
Tracked
  -> Suspect
  -> Predicted
  -> Lost
  -> Recovering
  -> Tracked
```

### 4.1 推奨閾値

| 状態       | 遷移条件の初期値                                                    | 処理                                  |
| ---------- | ------------------------------------------------------------------- | ------------------------------------- |
| Tracked    | 信頼性が移行閾値以上、予測と観測の差が正常、2フレーム以上安定       | 通常追従                              |
| Suspect    | 信頼性が exit 閾値未満、または予測と観測の差急増が2フレーム程度継続 | 観測重みを下げ、フィルタを強める      |
| Predicted  | 信頼性が予測閾値未満で 66〜100ms 継続、または観測欠落               | Kalman / 前フレームの値速度で短期予測 |
| Lost       | 一時欠損が部位別未検出時間を超える                                  | 無理のない自然姿勢 / 中立姿勢へ退避   |
| Recovering | 信頼性が復帰閾値以上で2〜3フレーム継続                              | 未加工の観測値へ急変せず合成復帰      |

部位別の初期閾値は次を推奨します。

| 部位               |      Trackedへの移行 | Trackedからの離脱 | 予測未満 |       Lost 時間 |
| ------------------ | -------------------: | ----------------: | -------: | --------------: |
| 体幹               |                 0.60 |              0.45 |     0.35 |     800〜1200ms |
| 頭部               |                 0.65 |              0.50 |     0.40 |      500〜900ms |
| 手首 / 腕          |                 0.70 |              0.55 |     0.45 |      450〜700ms |
| 肘の曲がる方向     |                 0.70 |              0.55 |     0.45 |      350〜600ms |
| 指                 |                 0.70 |              0.55 |     0.45 |      250〜400ms |
| ジェスチャー表示名 | 0.65 + 2〜3 フレーム |              0.45 |     なし | 300〜700ms 保持 |

`enter` と `exit` を分けることで、状態短時間の繰り返し切り替えを抑えます。特に前出し具合 / 開き具合 / ジェスチャー表示名はヒステリシスを必ず入れるべきです。

### 4.2 予測と観測の差判定

信頼性が高くても、観測値が前フレーム予測から大きく外れている場合は外れ値として扱います。

```ts
innovation = observed - predicted;
innovationNorm = length(innovation);

if (innovationNorm > thresholdByPart[part]) {
    reliability.temporalConsistency *= 0.1;
    state = "Suspect";
}
```

角度系では、1フレームで大きく跳ぶ回転を除外 / 減衰します。

| 対象           |                  警告 | 除外 / 強い減衰 |
| -------------- | --------------------: | --------------: |
| 頭部           |      12〜18 deg/frame |    30 deg/frame |
| 体幹 / 胸      |       5〜10 deg/frame |    18 deg/frame |
| 肘の曲がる方向 |      25〜40 deg/frame |    60 deg/frame |
| 手首ロール     |      20〜35 deg/frame |    70 deg/frame |
| 指の曲げ       | 0.15〜0.25 / フレーム | 0.40 / フレーム |

---

## 5. 一時欠損 / 復帰中仕様

### 5.1 0〜200ms

この区間では、欠落を「まだ失踪ではない」と扱います。

| 部位           | 挙動                                                             |
| -------------- | ---------------------------------------------------------------- |
| 手首目標       | 前フレーム速度で短期予測し、速度を指数減衰                       |
| 肘の曲がる方向 | 前フレームの値曲がる方向を優先し、代替処理曲がる方向を少量混ぜる |
| 手首ロール     | 保持。新しい手のひらの基底が不安定なら更新しない                 |
| 指の曲げ       | 最後の安定曲げ / ジェスチャー表示名を保持                        |
| 頭部           | Face が欠落した場合は Pose 鼻 / 耳代替処理、なければ保持         |
| 体幹           | 保持。急に中立姿勢へ戻さない                                     |

速度減衰は次のような形で十分です。

```ts
velocity *= Math.exp(-dtMs / dampingTauMs);
```

初期値は、手首 `180〜250ms`、頭部 `250〜350ms`、指 `100〜180ms`、体幹 `500ms以上` です。

### 5.2 200〜700ms

この区間では、予測の信頼性が下がるため、無理のない自然姿勢へ徐々に退避します。

| 部位               | 挙動                                                        |
| ------------------ | ----------------------------------------------------------- |
| 手首目標           | IK 重みを徐々に 0.2〜0.5 へ下げ、体の前の安全な位置へ寄せる |
| 肘の曲がる方向     | 代替処理曲がる方向の比率を上げる                            |
| 手首ロール         | 中立姿勢ロールへ戻す                                        |
| 指の曲げ           | 中立姿勢または軽い開いた手へ戻す                            |
| ジェスチャー表示名 | 300〜500ms 程度保持し、その後不明 / 中立姿勢                |
| 頭部               | 顔が再検出されなければ胸前方に寄せる                        |
| 体幹               | 低速で中立姿勢へ戻す。大きな補正はしない                    |

### 5.3 700ms以降

この区間では `Lost` として扱います。

| 部位         | 挙動                                         |
| ------------ | -------------------------------------------- |
| 腕 / 手首    | IK 重みを0または低値にし、無理のない自然姿勢 |
| 指           | 中立姿勢曲げ                                 |
| 頭部         | Face / Pose 代替処理がなければ胸前方         |
| 体幹         | 安定した中立姿勢                             |
| ジェスチャー | 期限切れ                                     |

復帰時は `Recovering` を必ず挟みます。観測値に直接急変すると、03番で問題視されている再検出ジャンプが発生します。

### 5.4 再検出ジャンプを10〜15度以下に抑える方法

再検出時は、未加工の観測値を採用せず、次の制約を通します。

```ts
recoveryWeight =
    smoothstep(0, recoveryBlendMs, recoveryElapsedMs) * clamp01(reliability);

target = blend(predictedOrComfortable, observed, recoveryWeight);
target = clampAngularDelta(previousApplied, target, maxDegPerFrame);
```

推奨上限は、頭部 / 腕主要なボーンで `10〜15 deg/frame`、体幹 / 胸で `5〜8 deg/frame`、手首ロールで `15〜25 deg/frame` です。手首目標の位置は、肩幅正規化座標で `0.04〜0.08 / frame` 程度に制限します。

---

## 6. クォータニオンの対数空間での平滑化

現行の `smoothQuaternion()` は `Quaternion.slerp` ベースであり、最終仕上げとしては有効です。([GitHub][13])

ただし、部位別状態推定としては、クォータニオンの差分を接空間へ写してからフィルタする方が扱いやすいです。

```ts
// conceptual
const delta = qPrev.inverse() * qObserved;
const v = quatLog(delta); // Vector3: axis * angle
const vf = oneEuroOrLowPass.update(v); // filter in tangent space
const qNext = qPrev * quatExp(vf);
```

この方式にすると、以下が実装しやすくなります。

| 効果                 | 内容                                           |
| -------------------- | ---------------------------------------------- |
| 角速度制限           | 1フレームの角度差を明示的に制限できる          |
| 信頼性を考慮した更新 | 信頼性が低い時だけ観測差分を弱められる         |
| Recovering 合成      | 予測値姿勢から観測値姿勢へ自然に戻せる         |
| 部位別調整           | 頭部、胸、手首ロールで異なる遮断周波数を使える |

実装初期段階では、既存の slerp 平滑化を残しつつ、頭部 / 胸 / 手首ロールだけ対数空間での平滑化へ置き換えるのが安全です。

---

## 7. 遅延の配分

現行の既定姿勢推論 fps は12fpsであり、サンプリング間隔だけで約83msになります。全体目標推論 fps 15fpsでも約67msです。([GitHub][14])

この状態で手・頭の体感遅延を100ms前後以内に収めるには、フィルタが追加できる遅延は非常に小さくなります。したがって、手・頭は `smoothingMs: 155` のような一律平滑化ではなく、One Euro Filter の速度係数を高めに設定し、高速動作時の遮断周波数を上げる必要があります。

概算式は次です。

```text
perceived latency
  ~= camera frame age
   + scheduling / queue delay
   + MediaPipe inference time
   + filter phase delay
   + render wait
```

`requestVideoFrameCallback` の `mediaTime`、`presentationTime`、`presentedFrames`、およびコールバックの `now` と `expectedDisplayTime` を記録すれば、フレーム遅れと描画遅れを分離できます。MDN でも、`requestVideoFrameCallback` は映像フレームレートに合わせて呼ばれ、映像解析やフレーム同期に使える API と説明されています。([MDN Web 文書][5])

推奨許容時間は次です。

| 対象           | 目標総遅延 | フィルタ追加分の目安 | 方針                            |
| -------------- | ---------: | -------------------: | ------------------------------- |
| 指             |  60〜100ms |             25〜55ms | ジェスチャーヒステリシスは短く  |
| 手首目標       |  70〜110ms |             45〜85ms | One Euro 高速度係数 + 予測      |
| 頭部           |  70〜120ms |             50〜95ms | Face 行列優先、代替処理は穏やか |
| 体幹 / 胸      | 120〜200ms |            80〜150ms | 安定重視でよい                  |
| 肘の曲がる方向 | 100〜180ms |            80〜140ms | 反転防止優先                    |
| 手首ロール     | 120〜220ms |            90〜160ms | 強く抑える                      |

実装上は、姿勢推論 fps を12のまま固定する場合、手先の反応性には限界があります。高反応モードでは姿勢 / 手 / 顔の実行頻度を分け、頭部 / 手系を20〜30fpsに近づけるか、少なくとも欠落中の短期予測で体感遅延を補う必要があります。

---

## 8. MediaPipe Hand / Face / Gesture を見据えた注意点

03番の前提には Pose / Hand / Face / Gesture が含まれますが、確認した現行ツリーでは `features/gaze` 配下に `faceTracking` と `poseTracking` はある一方、専用の `handTracking` / `gesture` 推論処理はまだ見当たりません。([GitHub][3])

Hand Landmarker は21個の手の特徴点、ワールド座標の特徴点、左右判定を返し、`minHandDetectionConfidence`、`minHandPresenceConfidence`、`minTrackingConfidence` を持ちます。映像モードでは、存在確率が閾値を下回ると手のひら検出を再実行し、追跡が成功している場合は検出を省略する設計です。([Google for Developers][15])

Face Landmarker は3D 顔の特徴点、ブレンドシェイプスコア、顔の変換行列を返せます。また `numFaces = 1` のときのみ平滑化が適用される仕様があるため、頭部姿勢の安定化では単一人物前提の設定が有利です。([Google for Developers][16])

したがって、将来の Hand / Gesture 追加時にも、Landmarker の信頼度をそのまま使うのではなく、アプリ側の `ReliabilityMap` に統合するべきです。

---

## 9. 測定指標

添付ロードマップでは、最初に記録・再生・評価指標を作ることが重視されています。これは今回の時系列処理でも必須です。

| 指標                         | 測定方法                                                                        |                               初期目標 |
| ---------------------------- | ------------------------------------------------------------------------------- | -------------------------------------: |
| 中立姿勢での細かな揺れ       | 5〜10秒中立姿勢姿勢で最終ボーン回転 / 標準化した値の標準偏差を測る              | 体幹 < 0.5〜1.0deg、頭部 < 1.0〜1.5deg |
| 手首目標 RMS 細かな揺れ      | 中立姿勢中の手首目標身体のローカル座標系の座標のRMS                             |  < 0.01〜0.02 身体寸法を基準とする単位 |
| 復帰時の急変                 | `Predicted/Lost -> Recovering` 後500msの最大フレーム差分                        |               主要なボーン < 10〜15deg |
| 角速度の急増                 | 部位別の角速度閾値超過回数                                                      |                         調整前比で減少 |
| 追加遅延                     | 未加工標準化したスカラーとフィルター処理済み出力の相互相関 / ジェスチャー開始差 |                   手・頭部 < 100ms前後 |
| 一時欠損滞在時間             | 部位別に Suspect / Predicted / Lost 滞在時間を集計                              |                         シーン別に比較 |
| 値の制限発生率               | IK 到達距離制限 / 曲がる方向除外の発生率                                        |           高すぎる場合は目標倍率見直し |
| 状態短時間の繰り返し切り替え | 1秒あたりの状態遷移回数                                                         |                     ヒステリシスで抑制 |

---

## 10. デバッグログに追加すべき項目

現行 `motionDebug` のスナップショット / 取得 / 固定データ機能を拡張し、次の JSONL 形式ログを保存できるようにするのがよいです。

| 分類            | 項目                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| フレーム時計    | `frameId`, `mediaTimeMs`, `presentationTimeMs`, `expectedDisplayTimeMs`, `presentedFrames`, `dtMs`, `rvfcLate` |
| カメラ          | `width`, `height`, `trackSettings`, `actualFps`, `borderRisk`, `torsoInFrame`, `handsInFrame`                  |
| 推論            | タスク種別、開始・終了、継続時間、省略済み理由、Worker・メインスレッド                                         |
| 未加工の観測値  | 特徴点 x/y/z、存在確率、可視性、追跡信頼度                                                                     |
| 信頼性          | 画面端重み、骨長の整合性、時系列予測と観測の差、左右整合性、最終重み                                           |
| 標準化した      | 体幹の座標系、頭部クォータニオン、手首目標、肘の曲がる方向、手首ロール、指の曲げ                               |
| 時系列          | 部位状態、フィルタパラメータ、未加工値、フィルター処理済み値、速度、共分散、dropoutAge、recoveryProgress       |
| 動作の変換 / IK | IK 目標、IK 重み、値の制限理由、曲がる方向除外、代替処理理由、最終ボーンクォータニオン                         |
| 評価指標        | 中立姿勢での細かな揺れ、復帰時の急変、追加遅延、角速度の急増、状態遷移件数                                     |

このログがあると、ライブカメラなしで同一入力を再生し、パラメータ差分を定量比較できます。

---

## 11. 実装計画

### 段階 1: FrameClock とログ基盤

`requestVideoFrameCallback` ベースの `FrameClock` を追加します。未対応環境では現行 `requestAnimationFrame` を代替処理とします。

```text
TrackerRuntime
  -> FrameClock
       - requestVideoFrameCallback
       - mediaTime / presentedFrames
       - rAF 代替処理
  -> 認識処理実行頻度
  -> 診断ログ
```

この段階では、アルゴリズムを大きく変えず、まず `mediaTimeMs`、`dtMs`、欠落フレーム、推論継続時間、動作の変換適用時間を記録します。

### 段階 2: ReliabilityMap

現行 `SincroPoseMotionSnapshot` の `confidence`、`visibility`、`presence`、`targetQuality`、`usableForIk`、`stale` を集約し、部位別信頼性と時系列予測と観測の差を明示します。添付 report02 でも、存在確率 / 可視性 / 追跡 / 領域分割 / 時系列 / ボーン整合性を合成する信頼性層が推奨されています。

```ts
type PartReliability = {
    model: number;
    visibility: number;
    presence: number;
    border: number;
    boneLength: number;
    temporal: number;
    side: number;
    final: number;
};
```

### 段階 3: TemporalStateEstimator

既存の `src/character/retargeting` の前段に、次のようなモジュールを追加します。添付 report02 でも `OneEuroFilter.ts`、`KalmanStateEstimator.ts`、`Hysteresis.ts`、`DropoutStateMachine.ts` などの時系列モジュールが提案されています。

```text
temporal/
  OneEuroFilter.ts
  KalmanVector3Filter.ts
  QuaternionLogFilter.ts
  Hysteresis.ts
  DropoutStateMachine.ts
  TemporalUpperBodyEstimator.ts
```

初期実装では、手首目標、頭部回転、体幹回転、肘の曲がる方向、指の曲げの5種類に限定するのがよいです。

### 段階 4: Retargeter の平滑化役割を縮小

`SincroPoseRetargeter.smoothFrame()` は完全には削除せず、最終出力の短い保険平滑化として残します。一方、主たる細かな揺れ抑制は `TemporalStateEstimator` 側へ移します。

推奨初期値は次です。

| 項目                     |                 現行 |                        推奨 |
| ------------------------ | -------------------: | --------------------------: |
| 全体共通の `smoothingMs` |                155ms |              40〜80msへ縮小 |
| 体幹平滑化               | 全体共通の設定に依存 |    時系列側で100〜150ms相当 |
| 手首平滑化               | 全体共通の設定に依存 | One Euro + Kalmanで45〜85ms |
| returnToNeutralMs        |                520ms |           部位別 200〜900ms |
| minConfidence            |                 0.45 |      部位別信頼性閾値へ移行 |

### 段階 5: motionDebug 再生 / 評価指標

`loadVideoFixture` を活かし、未加工の観測値ログと再生処理工程を追加します。最終的には、同一ログに対してフィルタパラメータ一式を切り替え、中立姿勢での細かな揺れ / 復帰時の急変 / 追加遅延を比較できるようにします。

---

## 12. 採用しない、または後回しにする手法

B-spline 平滑化や Savitzky-Golay のような未来のフレームを使う平滑化は、未来フレームを使える録画後補正では有効ですが、ライブ会話用途では遅延が問題になります。既存 report02 でも、ライブ用途は One Euro / Kalman / EMA、録画後補正は B-spline / Savitzky-Golay / 未来のフレームを使う平滑化と分ける方針が示されています。

SmoothNet のような時系列だけを使う補正ネットワークは、既存姿勢推定処理の細かな揺れ軽減を目的とする組み込んですぐ使える型の時系列補正モデルですが、学習データ、追加モデル、ブラウザ統合、ライセンス確認が必要です。まず規則に基づくな信頼度を考慮した時系列推定処理と再生ログを作り、その限界が見えてから検討するのが妥当です。([arXiv][17])

---

## 13. 最終提案

今回の03番タスクで実装方針として採用すべき結論は次です。

1. **`requestVideoFrameCallback` ベースの FrameClock を導入する。**
   現行の `requestAnimationFrame` + fps 検査では、動画フレーム時刻、推論時刻、描画時刻が混ざりやすく、フィルタ遅延の評価が難しいためです。

2. **`SincroPoseMotionSnapshot` を直接動作の変換せず、`ReliabilityMap -> CanonicalUpperBodyState -> TemporalStateEstimator` を挟む。**
   現行スナップショットは信頼性層の材料として良い構造を持っています。

3. **フィルタは部位別に分ける。**
   胴体は低遮断周波数、手先と頭は高速度係数、肘の曲がる方向と手首ロールは反転 / ロール暴れ抑制優先、指は曲げ + ヒステリシスとします。

4. **カルマンフィルタは常用平滑化ではなく一時欠損 / 回復用に使う。**
   手・肘・頭の一時欠落では等速度予測と速度の減衰を使い、700ms超では無理のない自然姿勢へ退避します。

5. **再検出時は未加工の観測値へ急変しない。**
   `Recovering` 状態を設け、復帰合成と角度の差分値の制限により、主要ボーンのジャンプを10〜15度以下に抑えます。

6. **motionDebug を「見える化」から「再現可能な評価基盤」へ拡張する。**
   中立姿勢での細かな揺れ、復帰時の急変、追加遅延、状態遷移、角速度の急増をログから算出できるようにします。

この方針により、既存の `trackingRuntime`、`poseTracking`、`retargeting`、`ik`、`motionDebug` を活かしつつ、03番の主題である **低遅延・欠落耐性・再検出安定性を持つ時系列推定層** を追加できます。

[1]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/package.json "raw.githubusercontent.com"
[3]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/features/gaze "Sincromisor/sincromisor-frontend/src/features/gaze at main · Sincromisor/Sincromisor · GitHub"
[4]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFrameLoop.ts "raw.githubusercontent.com"
[5]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback "HTMLVideoElement: requestVideoFrameCallback() method - Web APIs | MDN"
[6]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts "raw.githubusercontent.com"
[7]: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[8]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTrackerNormalizer.ts "raw.githubusercontent.com"
[9]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts "raw.githubusercontent.com"
[10]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character/ik "Sincromisor/sincromisor-frontend/src/character/ik at main · Sincromisor/Sincromisor · GitHub"
[11]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/pages/motionDebug "Sincromisor/sincromisor-frontend/src/pages/motionDebug at main · Sincromisor/Sincromisor · GitHub"
[12]: https://gery.casiez.net/1euro/ "1€ Filter"
[13]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/retargeting/sincroPoseRetargetFrame.ts "raw.githubusercontent.com"
[14]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts "raw.githubusercontent.com"
[15]: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google for Developers"
[16]: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js "Face landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[17]: https://arxiv.org/abs/2112.13715?utm_source=chatgpt.com "SmoothNet: A Plug-and-Play Network for Refining Human Poses in Videos"
