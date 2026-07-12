# 調査レポート：sincromisor-frontend 時系列推定 / フィルタ / レイテンシ設計

対象は、`sincro` モードにおける **MediaPipe 由来の jitter、欠落、外れ値、再検出ジャンプを抑えつつ、低遅延なVRM上半身モーションを生成する時系列処理**です。添付 `03-temporal-filtering.md` は、単純な平滑化ではなく、部位別 reliability を持つ観測値から body-local canonical state と最終 VRM pose を安定化する「状態推定」として整理することを求めています。手・頭の体感遅延はおおむね100ms前後以内、胴体は安定重視という目標が明示されています。

## 0. 結論

現行の `sincromisor-frontend` には、時系列処理を拡張するための足場は既にあります。`features/gaze/trackingRuntime`、`features/gaze/poseTracking`、`character/retargeting`、`character/ik`、`pages/motionDebug` という責務境界があり、添付ロードマップでもこれらを破棄せず、`FrameClock`、`ReliabilityMap`、`CanonicalUpperBodyState`、`TemporalStateEstimator`、`MotionDebugRecorder` などを追加する方針が示されています。

ただし、現行実装の時系列処理は、主に **retarget frame へのグローバルな smoothing / neutral fallback** に寄っています。`SincroPoseRetargeter` には `smoothingMs` と `returnToNeutralMs` があり、既定値は `smoothingMs: 155`、`returnToNeutralMs: 520`、`minConfidence: 0.45` です。また `smoothFrame()` は数値成分の線形補間と quaternion `slerp` を使う構成です。これは安定化の初期実装としては妥当ですが、03番の調査依頼が求める **部位別状態遷移、欠落予測、再検出復帰、confidence-aware filtering** には不足しています。([GitHub][1])

推奨する次段階は、`smoothingMs` をさらに調整することではなく、次の層を `poseTracking` と `retargeting` の間に追加することです。

```text
MediaPipe result
  -> SincroPoseMotionSnapshot / raw observation
  -> ReliabilityMap
  -> Body-local CanonicalUpperBodyState
  -> TemporalStateEstimator
       - One Euro Filter
       - Kalman constant-velocity prediction
       - DropoutStateMachine
       - Hysteresis / debounce
       - quaternion log-space smoothing
  -> Retarget / IK / VRM normalized local rotations
```

この方向性は、添付資料群の「MediaPipe landmark を直接 VRM bone へ流さず、不確実な観測値として扱う」という基本方針と一致します。

---

## 1. 現行実装の確認

`sincromisor-frontend` は `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、React、Vite、TypeScript を使用しています。`package.json` 上では `@mediapipe/tasks-vision` が `^0.10.34`、`@pixiv/three-vrm` が `^3.5.1`、`three` が `^0.182.0` です。([GitHub][2])

関連するディレクトリ構成は、今回の追加実装に適した分割になっています。`src/features/gaze` には `faceTracking`、`poseTracking`、`trackingRuntime` があり、`src/character` には `ik` と `retargeting` があり、`src/pages` には `motionDebug` と `poseLandmarkerSpike` が存在します。([GitHub][3])

### 1.1 Runtime / cadence

現行の `TrackerRuntimeFrameLoop` は `requestAnimationFrame` を使うフレームループで、cadence 判定は `performance.now()` と目標fpsに基づいています。既定値は全体の target inference fps が15、pose inference fps が12です。([GitHub][4])

この構成では、カメラ映像フレームの時刻と推論時刻が必ずしも一致しません。`HTMLVideoElement.requestVideoFrameCallback()` は、新しい映像フレームが compositor に送られるタイミングで呼ばれ、`mediaTime`、`presentationTime`、`presentedFrames` などの metadata を取得できます。`presentedFrames` は missed frame 検出に利用できます。([MDN Web Docs][5])

したがって、03番のテーマでは、まず `FrameClock` を `requestVideoFrameCallback` 基準へ移行し、未対応環境だけ `requestAnimationFrame` fallback にするべきです。これにより、One Euro Filter や Kalman filter の `dt` が映像フレーム基準になり、added latency と dropped frame を計測できます。

### 1.2 Pose tracking / snapshot

現行の `SincroPoseTracker` は MediaPipe `PoseLandmarker.detectForVideo(videoFrame, timestampMs)` を使い、`runningMode: "VIDEO"`、`numPoses: 1`、confidence 閾値0.5、`outputSegmentationMasks: false` で Pose Landmarker を構成しています。([GitHub][6])

MediaPipe Pose Landmarker は body pose landmarks と3D world landmarks を返し、`VIDEO` mode では `detectForVideo()` を使います。Web版の `detect()` / `detectForVideo()` は同期実行でUI threadをブロックするため、公式ドキュメントでも Web Worker の使用が推奨されています。([Google for Developers][7])

`SincroPoseTrackerNormalizer` は、shoulder visibility の不足時に fallback を返し、shoulder width、torso lean、shoulder roll、arm motion などの低振幅 snapshot へ正規化しています。`SincroPoseMotionSnapshot` には `targetQuality`、`confidence`、`visibility`、`presence`、`usableForIk`、`ikWeight`、`stale`、world coordinate anchor などが含まれます。これは明示的な `ReliabilityMap` を導入する土台として有用です。([GitHub][8])

### 1.3 Retarget / IK / smoothing

`SincroPoseRetargeter` は、pose が lost / low confidence の場合に neutral frame へ戻し、`smoothingMs` に基づいて retarget frame を平滑化します。腕については `SincroPoseArmRetargeter` が feature-based arm と IK arm を blend し、`world_3d_ik` / `screen_space_ik` のモードを持っています。([GitHub][9])

現行の `character/ik` には `sincroArmIkSolver`、`sincroArmIkPole`、`sincroArmIkConstraint` などが存在し、`character/retargeting` には `sincroPoseArmIkSolve`、`sincroPoseArmRetargeter`、`sincroPoseRetargetFrame` などが存在します。つまり、IK本体を大きく作り直す前に、IK target / pole / wrist roll へ渡す前段の時系列推定を追加するのが合理的です。([GitHub][10])

### 1.4 motionDebug

`motionDebug` には camera stream、video source、frame capture、pose overlay、debug API があり、`getSnapshot`、`captureFrame`、`loadVideoFixture` などの機能が存在します。([GitHub][11])

ただし、添付ロードマップが求める「同一入力ログから同一 retarget 結果を再現し、neutral jitter、elbow flip count、recovery jump、angular velocity spike、reach clamp occupancy を計測する」段階にはまだ達していません。最初に記録・再生・metrics 基盤を作るべき、というロードマップ上の優先順位は妥当です。

---

## 2. フィルタの使い分け

03番の依頼では、EMA、One Euro Filter、Kalman filter、quaternion log-space smoothing、hysteresis の使い分けが論点になっています。結論として、この分類は妥当です。ただし、「全 landmark に同じフィルタをかける」設計ではなく、**信頼度つき canonical control に対する部位別 state estimator** として実装するべきです。添付 report02 でも、時系列処理は raw landmark 座標への単純平滑化ではなく、複数段の状態推定として扱うべきとされています。

| 手法                           | 主用途                                                                             | 採用判断                                        |
| ------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| EMA                            | camera quality、reliability score、online calibration、UI表示、低速な neutral 補正 | 採用。ただし手先・頭の主平滑化には使いすぎない  |
| One Euro Filter                | wrist target、head rotation、canonical scalar、finger curl の低遅延 jitter 抑制    | 主採用                                          |
| Kalman filter                  | dropout 中の予測、再検出時の復帰、velocity damping                                 | 手・肘・頭に限定して採用                        |
| quaternion log-space smoothing | 最終ボーン回転、head / chest / wrist roll の短い仕上げ smoothing                   | 採用。既存 slerp smoothing の上位互換として導入 |
| hysteresis / debounce          | gesture label、open / close、forwardness / openness、状態遷移                      | 必須                                            |

One Euro Filter は、低速時には cutoff を下げて jitter を抑え、高速時には cutoff を上げて lag を減らす速度適応型 low-pass filter です。原論文では、最小 cutoff と速度係数 beta の2つの主要パラメータで jitter と lag のトレードオフを調整する方法が示されています。

One Euro Filter の実用上の調整は、まず `beta = 0` で低速時の jitter が消えるように `minCutoff` を決め、その後、速い動きの lag が許容範囲に入るまで `beta` を上げる手順が基本です。([Géry Casiez][12])

Kalman filter は、常時すべての値を滑らかにするためではなく、**観測欠落中の短期予測と、再検出時の観測値への復帰** に使うべきです。添付 report02 でも、`position`、`velocity`、`covariance` を持つ constant velocity model とし、measurement noise を reliability に応じて変える方式が提案されています。

---

## 3. 部位別フィルタ設計

下表は、添付 report03 の既存パラメータ案を出発点に、現行実装の `smoothingMs: 155` が手・頭にはやや重く、胴体には妥当である点を加味して再整理した初期値です。既存資料では、One Euro Filter の目安として torso `minCutoff 0.5〜0.8`、head `1.0〜1.8`、wrist `1.5〜2.5`、finger curl `3.0〜6.0` などが示されています。

前提として、`minCutoff` は Hz、`beta` は入力スケール依存です。wrist target は肩幅または体幹長で正規化した body-local 座標、角度系は radians で内部表現する想定です。

| 部位               |                          主フィルタ | One Euro `minCutoff` |     `beta` | 欠落予測                    | 復帰 blend | 追加遅延目標 | 備考                                         |
| ------------------ | ----------------------------------: | -------------------: | ---------: | --------------------------- | ---------: | -----------: | -------------------------------------------- |
| torso rotation     | One Euro + quaternion log smoothing |           0.45〜0.75 | 0.03〜0.12 | 基本 hold + neutral decay   | 500〜900ms |   100〜150ms | 胴体 jitter は最優先で抑える                 |
| chest / upperChest |          One Euro +分配後 smoothing |             0.7〜1.1 | 0.05〜0.18 | hold + slow decay           | 400〜700ms |    80〜130ms | shoulder / arm の補正と連動                  |
| head rotation      | One Euro + quaternion log smoothing |             1.2〜1.8 | 0.12〜0.35 | Kalman / hold               | 200〜400ms |     50〜95ms | Face matrix がある場合は主入力にする         |
| wrist target       |                One Euro + Kalman CV |             1.8〜2.8 | 0.25〜0.70 | constant velocity + damping | 180〜320ms |     45〜85ms | 手先は反応性重視                             |
| elbow pole         |        One Euro + outlier rejection |             0.7〜1.3 | 0.02〜0.15 | previous pole + fallback    | 250〜450ms |    80〜140ms | flip 防止を最優先                            |
| wrist roll         |      強め One Euro + quaternion log |            0.45〜1.0 | 0.02〜0.12 | hold + neutral roll decay   | 250〜500ms |    90〜160ms | palm basis の信頼度が低い時は抑制            |
| finger curl        |               One Euro + hysteresis |             3.0〜6.5 | 0.30〜1.20 | label / curl hold           | 100〜200ms |     25〜55ms | 3D指回転ではなく curl / splay を主表現にする |
| gesture state      |               hysteresis / debounce |               不使用 |     不使用 | label hold                  | 120〜300ms |    50〜150ms | 最短2〜3フレーム継続で確定                   |

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

| 状態       | 遷移条件の初期値                                                          | 処理                                    |
| ---------- | ------------------------------------------------------------------------- | --------------------------------------- |
| Tracked    | reliability が enter 閾値以上、innovation が正常、2フレーム以上安定       | 通常追従                                |
| Suspect    | reliability が exit 閾値未満、または innovation spike が2フレーム程度継続 | 観測重みを下げ、filter を強める         |
| Predicted  | reliability が predict 閾値未満で 66〜100ms 継続、または観測欠落          | Kalman / previous velocity で短期予測   |
| Lost       | dropout が部位別 lost 時間を超える                                        | comfortable pose / neutral pose へ退避  |
| Recovering | reliability が recover 閾値以上で2〜3フレーム継続                         | raw observation へ snap せず blend 復帰 |

部位別の初期閾値は次を推奨します。

| 部位          |      Tracked enter | Tracked exit | Predict below |       Lost 時間 |
| ------------- | -----------------: | -----------: | ------------: | --------------: |
| torso         |               0.60 |         0.45 |          0.35 |     800〜1200ms |
| head          |               0.65 |         0.50 |          0.40 |      500〜900ms |
| wrist / arm   |               0.70 |         0.55 |          0.45 |      450〜700ms |
| elbow pole    |               0.70 |         0.55 |          0.45 |      350〜600ms |
| finger        |               0.70 |         0.55 |          0.45 |      250〜400ms |
| gesture label | 0.65 + 2〜3 frames |         0.45 |          なし | 300〜700ms hold |

`enter` と `exit` を分けることで、state flapping を抑えます。特に forwardness / openness / gesture label は hysteresis を必ず入れるべきです。

### 4.2 innovation 判定

reliability が高くても、観測値が前フレーム予測から大きく外れている場合は外れ値として扱います。

```ts
innovation = observed - predicted;
innovationNorm = length(innovation);

if (innovationNorm > thresholdByPart[part]) {
    reliability.temporalConsistency *= 0.1;
    state = "Suspect";
}
```

角度系では、1フレームで大きく跳ぶ回転を reject / damp します。

| 対象          |            warning | reject / heavy damp |
| ------------- | -----------------: | ------------------: |
| head          |   12〜18 deg/frame |        30 deg/frame |
| torso / chest |    5〜10 deg/frame |        18 deg/frame |
| elbow pole    |   25〜40 deg/frame |        60 deg/frame |
| wrist roll    |   20〜35 deg/frame |        70 deg/frame |
| finger curl   | 0.15〜0.25 / frame |        0.40 / frame |

---

## 5. dropout / recovering 仕様

### 5.1 0〜200ms

この区間では、欠落を「まだ失踪ではない」と扱います。

| 部位         | 挙動                                                           |
| ------------ | -------------------------------------------------------------- |
| wrist target | 前フレーム速度で短期予測し、速度を指数減衰                     |
| elbow pole   | previous pole を優先し、fallback pole を少量混ぜる             |
| wrist roll   | hold。新しい palm basis が不安定なら更新しない                 |
| finger curl  | 最後の安定 curl / gesture label を保持                         |
| head         | Face が欠落した場合は Pose nose / ears fallback、なければ hold |
| torso        | hold。急に neutral へ戻さない                                  |

速度減衰は次のような形で十分です。

```ts
velocity *= Math.exp(-dtMs / dampingTauMs);
```

初期値は、wrist `180〜250ms`、head `250〜350ms`、finger `100〜180ms`、torso `500ms以上` です。

### 5.2 200〜700ms

この区間では、予測の信頼性が下がるため、comfortable pose へ徐々に退避します。

| 部位          | 挙動                                                           |
| ------------- | -------------------------------------------------------------- |
| wrist target  | IK weight を徐々に 0.2〜0.5 へ下げ、体の前の安全な位置へ寄せる |
| elbow pole    | fallback pole の比率を上げる                                   |
| wrist roll    | neutral roll へ戻す                                            |
| finger curl   | neutral または軽い open hand へ戻す                            |
| gesture label | 300〜500ms 程度保持し、その後 unknown / neutral                |
| head          | 顔が再検出されなければ chest forward に寄せる                  |
| torso         | 低速で neutral へ戻す。大きな補正はしない                      |

### 5.3 700ms以降

この区間では `Lost` として扱います。

| 部位         | 挙動                                          |
| ------------ | --------------------------------------------- |
| arms / wrist | IK weight を0または低値にし、comfortable pose |
| fingers      | neutral curl                                  |
| head         | Face / Pose fallback がなければ chest forward |
| torso        | stable neutral                                |
| gesture      | expired                                       |

復帰時は `Recovering` を必ず挟みます。観測値に直接 snap すると、03番で問題視されている再検出ジャンプが発生します。

### 5.4 再検出ジャンプを10〜15度以下に抑える方法

再検出時は、raw observation を採用せず、次の制約を通します。

```ts
recoveryWeight =
    smoothstep(0, recoveryBlendMs, recoveryElapsedMs) * clamp01(reliability);

target = blend(predictedOrComfortable, observed, recoveryWeight);
target = clampAngularDelta(previousApplied, target, maxDegPerFrame);
```

推奨上限は、head / arm major bones で `10〜15 deg/frame`、torso / chest で `5〜8 deg/frame`、wrist roll で `15〜25 deg/frame` です。wrist target の位置は、肩幅正規化座標で `0.04〜0.08 / frame` 程度に制限します。

---

## 6. quaternion log-space smoothing

現行の `smoothQuaternion()` は `Quaternion.slerp` ベースであり、最終仕上げとしては有効です。([GitHub][13])

ただし、部位別状態推定としては、quaternion の差分を tangent space へ写してからフィルタする方が扱いやすいです。

```ts
// conceptual
const delta = qPrev.inverse() * qObserved;
const v = quatLog(delta); // Vector3: axis * angle
const vf = oneEuroOrLowPass.update(v); // filter in tangent space
const qNext = qPrev * quatExp(vf);
```

この方式にすると、以下が実装しやすくなります。

| 効果                     | 内容                                             |
| ------------------------ | ------------------------------------------------ |
| angular velocity clamp   | 1フレームの角度差を明示的に制限できる            |
| reliability-aware update | reliability が低い時だけ観測差分を弱められる     |
| Recovering blend         | predicted pose から observed pose へ自然に戻せる |
| 部位別 tuning            | head、chest、wrist roll で異なる cutoff を使える |

実装初期段階では、既存の slerp smoothing を残しつつ、head / chest / wrist roll だけ log-space smoothing へ置き換えるのが安全です。

---

## 7. latency budget

現行の既定 pose inference fps は12fpsであり、サンプリング間隔だけで約83msになります。全体 target inference fps 15fpsでも約67msです。([GitHub][14])

この状態で手・頭の体感遅延を100ms前後以内に収めるには、フィルタが追加できる遅延は非常に小さくなります。したがって、手・頭は `smoothingMs: 155` のような一律 smoothing ではなく、One Euro Filter の beta を高めに設定し、高速動作時の cutoff を上げる必要があります。

概算式は次です。

```text
perceived latency
  ~= camera frame age
   + scheduling / queue delay
   + MediaPipe inference time
   + filter phase delay
   + render wait
```

`requestVideoFrameCallback` の `mediaTime`、`presentationTime`、`presentedFrames`、および callback の `now` と `expectedDisplayTime` を記録すれば、フレーム遅れと描画遅れを分離できます。MDN でも、`requestVideoFrameCallback` は video frame rate に合わせて呼ばれ、映像解析やフレーム同期に使える API と説明されています。([MDN Web Docs][5])

推奨 budget は次です。

| 対象          | 目標総遅延 | フィルタ追加分の目安 | 方針                                |
| ------------- | ---------: | -------------------: | ----------------------------------- |
| finger        |  60〜100ms |             25〜55ms | gesture hysteresis は短く           |
| wrist target  |  70〜110ms |             45〜85ms | One Euro 高 beta + prediction       |
| head          |  70〜120ms |             50〜95ms | Face matrix 優先、fallback は穏やか |
| torso / chest | 120〜200ms |            80〜150ms | 安定重視でよい                      |
| elbow pole    | 100〜180ms |            80〜140ms | flip 防止優先                       |
| wrist roll    | 120〜220ms |            90〜160ms | 強く抑える                          |

実装上は、pose inference fps を12のまま固定する場合、手先の反応性には限界があります。高反応モードでは pose / hand / face の cadence を分け、head / hand 系を20〜30fpsに近づけるか、少なくとも欠落中の短期予測で体感遅延を補う必要があります。

---

## 8. MediaPipe Hand / Face / Gesture を見据えた注意点

03番の前提には Pose / Hand / Face / Gesture が含まれますが、確認した現行ツリーでは `features/gaze` 配下に `faceTracking` と `poseTracking` はある一方、専用の `handTracking` / `gesture` pass はまだ見当たりません。([GitHub][3])

Hand Landmarker は21個の hand landmarks、world landmarks、handedness を返し、`minHandDetectionConfidence`、`minHandPresenceConfidence`、`minTrackingConfidence` を持ちます。Video mode では、presence が閾値を下回ると palm detection を再実行し、tracking が成功している場合は検出をskipする設計です。([Google for Developers][15])

Face Landmarker は3D face landmarks、blendshape scores、facial transformation matrices を返せます。また `numFaces = 1` のときのみ smoothing が適用される仕様があるため、頭部姿勢の安定化では単一人物前提の設定が有利です。([Google for Developers][16])

したがって、将来の Hand / Gesture 追加時にも、Landmarker の confidence をそのまま使うのではなく、アプリ側の `ReliabilityMap` に統合するべきです。

---

## 9. 測定指標

添付ロードマップでは、最初に記録・再生・metrics を作ることが重視されています。これは今回の時系列処理でも必須です。

| 指標                    | 測定方法                                                                      |                                初期目標 |
| ----------------------- | ----------------------------------------------------------------------------- | --------------------------------------: |
| neutral jitter          | 5〜10秒 neutral 姿勢で final bone rotation / canonical value の標準偏差を測る | torso < 0.5〜1.0deg、head < 1.0〜1.5deg |
| wrist target RMS jitter | neutral 中の wrist target body-local 座標のRMS                                |                 < 0.01〜0.02 body units |
| recovery jump           | `Predicted/Lost -> Recovering` 後500msの最大 frame delta                      |                  major bone < 10〜15deg |
| angular velocity spike  | 部位別の角速度閾値超過回数                                                    |                          調整前比で減少 |
| added latency           | raw canonical scalar と filtered output の相互相関 / gesture onset 差         |                   hand/head < 100ms前後 |
| dropout dwell time      | 部位別に Suspect / Predicted / Lost 滞在時間を集計                            |                          シーン別に比較 |
| clamp occupancy         | IK reach clamp / pole rejection の発生率                                      |      高すぎる場合は target scale 見直し |
| state flapping          | 1秒あたりの状態遷移回数                                                       |                        hysteresisで抑制 |

---

## 10. debug log に追加すべき項目

現行 `motionDebug` の snapshot / capture / fixture 機能を拡張し、次の JSONL 形式ログを保存できるようにするのがよいです。

| 分類            | 項目                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| frame clock     | `frameId`, `mediaTimeMs`, `presentationTimeMs`, `expectedDisplayTimeMs`, `presentedFrames`, `dtMs`, `rvfcLate` |
| camera          | `width`, `height`, `trackSettings`, `actualFps`, `borderRisk`, `torsoInFrame`, `handsInFrame`                  |
| inference       | task種別、start/end、duration、skipped reason、worker/main-thread                                              |
| raw observation | landmark x/y/z、presence、visibility、tracking confidence                                                      |
| reliability     | border weight、bone length consistency、temporal innovation、side consistency、final weight                    |
| canonical       | torso frame、head quaternion、wrist target、elbow pole、wrist roll、finger curl                                |
| temporal        | part state、filter params、raw value、filtered value、velocity、covariance、dropoutAge、recoveryProgress       |
| retarget / IK   | IK target、IK weight、clamp reason、pole rejection、fallback reason、final bone quaternion                     |
| metrics         | neutral jitter、recovery jump、added latency、angular velocity spike、state transition count                   |

このログがあると、ライブカメラなしで同一入力を replay し、パラメータ差分を定量比較できます。

---

## 11. 実装計画

### Phase 1: FrameClock とログ基盤

`requestVideoFrameCallback` ベースの `FrameClock` を追加します。未対応環境では現行 `requestAnimationFrame` を fallback とします。

```text
TrackerRuntime
  -> FrameClock
       - requestVideoFrameCallback
       - mediaTime / presentedFrames
       - rAF fallback
  -> Perception cadence
  -> Debug log
```

この段階では、アルゴリズムを大きく変えず、まず `mediaTimeMs`、`dtMs`、dropped frame、inference duration、retarget apply time を記録します。

### Phase 2: ReliabilityMap

現行 `SincroPoseMotionSnapshot` の `confidence`、`visibility`、`presence`、`targetQuality`、`usableForIk`、`stale` を集約し、部位別 reliability と temporal innovation を明示します。添付 report02 でも、presence / visibility / tracking / segmentation / temporal / bone consistency を合成する reliability layer が推奨されています。

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

### Phase 3: TemporalStateEstimator

既存の `src/character/retargeting` の前段に、次のようなモジュールを追加します。添付 report02 でも `OneEuroFilter.ts`、`KalmanStateEstimator.ts`、`Hysteresis.ts`、`DropoutStateMachine.ts` などの temporal module が提案されています。

```text
temporal/
  OneEuroFilter.ts
  KalmanVector3Filter.ts
  QuaternionLogFilter.ts
  Hysteresis.ts
  DropoutStateMachine.ts
  TemporalUpperBodyEstimator.ts
```

初期実装では、wrist target、head rotation、torso rotation、elbow pole、finger curl の5種類に限定するのがよいです。

### Phase 4: Retargeter の smoothing 役割を縮小

`SincroPoseRetargeter.smoothFrame()` は完全には削除せず、最終出力の短い保険 smoothing として残します。一方、主たる jitter 抑制は `TemporalStateEstimator` 側へ移します。

推奨初期値は次です。

| 項目                 |       現行 |                          推奨 |
| -------------------- | ---------: | ----------------------------: |
| global `smoothingMs` |      155ms |                40〜80msへ縮小 |
| torso smoothing      | global依存 |    Temporal側で100〜150ms相当 |
| wrist smoothing      | global依存 |   One Euro + Kalmanで45〜85ms |
| returnToNeutralMs    |      520ms |             部位別 200〜900ms |
| minConfidence        |       0.45 | 部位別 reliability 閾値へ移行 |

### Phase 5: motionDebug replay / metrics

`loadVideoFixture` を活かし、raw observation log と replay pipeline を追加します。最終的には、同一ログに対して filter parameter set を切り替え、neutral jitter / recovery jump / added latency を比較できるようにします。

---

## 12. 採用しない、または後回しにする手法

B-spline smoothing や Savitzky-Golay のような non-causal smoothing は、未来フレームを使える録画後補正では有効ですが、ライブ会話用途では遅延が問題になります。既存 report02 でも、ライブ用途は One Euro / Kalman / EMA、録画後補正は B-spline / Savitzky-Golay / non-causal smoothing と分ける方針が示されています。

SmoothNet のような temporal-only refinement network は、既存 pose estimator の jitter mitigation を目的とする plug-and-play 型の時系列補正モデルですが、学習データ、追加モデル、ブラウザ統合、ライセンス確認が必要です。まず rule-based な confidence-aware temporal estimator と replay log を作り、その限界が見えてから検討するのが妥当です。([arXiv][17])

---

## 13. 最終提案

今回の03番タスクで実装方針として採用すべき結論は次です。

1. **`requestVideoFrameCallback` ベースの FrameClock を導入する。**
   現行の `requestAnimationFrame` + fps gate では、動画フレーム時刻、推論時刻、描画時刻が混ざりやすく、filter delay の評価が難しいためです。

2. **`SincroPoseMotionSnapshot` を直接 retarget せず、`ReliabilityMap -> CanonicalUpperBodyState -> TemporalStateEstimator` を挟む。**
   現行 snapshot は reliability layer の材料として良い構造を持っています。

3. **フィルタは部位別に分ける。**
   胴体は低 cutoff、手先と頭は高 beta、elbow pole と wrist roll は flip / roll 暴れ抑制優先、finger は curl + hysteresis とします。

4. **Kalman filter は常用 smoothing ではなく dropout / recovery 用に使う。**
   手・肘・頭の一時欠落では constant velocity prediction と velocity damping を使い、700ms超では comfortable pose へ退避します。

5. **再検出時は raw observation へ snap しない。**
   `Recovering` 状態を設け、復帰 blend と angular delta clamp により、主要ボーンのジャンプを10〜15度以下に抑えます。

6. **motionDebug を「見える化」から「再現可能な評価基盤」へ拡張する。**
   neutral jitter、recovery jump、added latency、state transition、angular velocity spike をログから算出できるようにします。

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
