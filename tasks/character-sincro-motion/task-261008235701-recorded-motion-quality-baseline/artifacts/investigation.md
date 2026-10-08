# キャラクターモーション反映の改善検討

## 結論

新しい推定モデルを導入する前に、既存の観測・時系列処理・VRM適用の境界を修正する。最優先は座標原点と尺度の統一、欠損予測の表示への接続、指の保持期限である。その上で、同じ撮影済み入力から最終姿勢を再計算し、揺れ・追従遅れ・動きの振幅を一緒に比較する。

単眼映像の推定値には奥行きや遮蔽の曖昧さがある。信頼できる動きはそのまま反映し、情報のない部位だけを短時間の履歴や控えめな補助姿勢で補う方針を採る。滑らかさだけを目的に動きを縮めることや、意図認識の結果で観測された姿勢を置き換えることは避ける。

追加撮影は行わない。映像はローカル環境だけで再解析し、人物動画や未加工の追跡記録を公開成果物へ追加しない。

## 調査範囲と確度

- 調査日: 2026年10月8日〜9日。
- 調査対象のHEAD: `86929dfdbc43e31390da98c987c864bb39e6686a`。
- 対象: 追跡の正規化、体幹・腕の共通表現、信頼性、時系列推定、腕IK、本番の姿勢合成・VRM適用、指・動作意図、録画再生、関連する設計と過去の検証結果。
- 実施: コード照合、過去の実写集計の確認、公式資料の調査、現在の関数を呼ぶ5件の合成入力による再現、撮影済み6動画のハッシュ・形式と610フレームの保存項目の確認、交差・手振り動画の代表静止画の確認。
- 未実施: 撮影、ブラウザー操作、実写の再推論・VRM表示との目視比較、実装、性能測定。今回の数値再現は人体映像の品質測定ではない。

## 維持する構成

```text
MediaPipeの結果
  → 正規化した観測と品質・観測時刻
  → 体幹基準の共通表現
  → 観測時刻で進む時系列推定
  → モデルの骨長に合わせた腕IK・体幹変換
  → 部位ごとの追跡・補助姿勢の合成
  → 描画時刻での補間・最終制限
  → 正規化済みローカル姿勢の一括適用
```

`SincroMotionComputation`の共通化は2026年9月のタスクで完了しており、再度の全面再編は不要。`setNormalizedPose()`で上半身を一括適用し、その後に`vrm.update()`を呼ぶ構成も維持する。頭部・首・表情の別制御、AI発話時の口形優先、骨盤位置の固定は今回の改善と両立させる。

## 現在の実装で確認した問題

### 1. 座標の原点と尺度が途中で変わる

[正規化処理](../../../../sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTrackerNormalizer.ts)は腕を肩中心、下半身を腰中心に正規化する。[体幹推定](../../../../sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts)は両者の`world.normalized*`を同じ原点として扱う。両中心はそれぞれ0になるため、有効な腰の位置を体幹推定に利用できない固定入力を再現した。

体幹の`bodyRight`と`bodyUp`は個別に正規化されるだけで直交が保証されず、傾いた入力では内積が約0.1961になった。これは剛体回転としての座標変換に必要な条件を満たさない。

[腕IKへの橋渡し](../../../../sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts)では、撮影者の肩幅で正規化した手首・肘からVRMのメートル単位の肩位置を減算する。到達距離を後で補正しても方向誤差が残る。相似なVRMを2倍にした固定入力で、手首目標の方向が約12.5116度変化した。

撮影者の共通座標内で肩相対方向を作り、距離だけをモデルの骨長へ写す。[座標修正タスク](../../task-261008235701-motion-coordinate-consistency/task.md)で一貫して扱う。

### 2. 欠損予測が最終姿勢へ届かない

[予測処理](../../../../sincromisor-frontend/src/character/temporal/temporalArmDropout.ts)は失われた観測の信頼度を予測状態へ写す。信頼度0の短い欠損で状態は`predicted`だが、腕IK目標の重みは0となった。[リターゲット](../../../../sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts)も全体未検出時には腕ごとの予測を読む前に中立復帰する。

また、時系列推定はPose到着時だけ進み、長すぎる時刻差では有効差分を0にする。観測の無到着・低頻度到着で期限がどう進むかを、描画まで通して確認する必要がある。[欠損・復帰タスク](../../task-261008235702-motion-dropout-application/task.md)で観測品質と表示用の保持重みを分ける。

### 3. 指の欠損と保持に一貫した期限がない

[指層生成](../../../../sincromisor-frontend/src/character/motionIntent/fingerCurlPoseLayer.ts)の保持期限は前回出力との差で判定する。保持結果の時刻が更新され続けるため、欠損値を100ミリ秒ごとに与えると、250ミリ秒の期限を超えた1秒後にも曲げ0.8が残る。

この再現は特徴量が欠ける境界入力である。通常の欠損スナップショットには有限の曲げ0が入り、こちらは有効な開いた指として即時採用される。検出・信頼度を判定しない点と合わせて修正する。`curlScale`を保持結果へ再度掛ける経路も確認対象にする。[指の期限タスク](../../task-261008235702-finger-observation-expiry/task.md)で最後の有効観測を保持期限の起点にする。

### 4. 評価が入力の揺れと中間状態に偏る

[現在の`neutralJitter`](../../../../sincromisor-frontend/src/character/motionEvaluation/motionMetricBaseCalculators.ts)は画面上の手首と肩中心の差を測る。VRMの最終姿勢が改善したことを示す指標ではない。肘反転拒否の件数も、画面上で肘が反転した件数とは同一ではない。

[通常再生](../../../../sincromisor-frontend/src/pages/motionDebug/motionDebugReplayRuntime.ts)は保存済みの共通表現・時系列状態を採用する。変更した推定器を比較する際には、保存値を使う閲覧と入力からの再計算を明示的に分ける。[比較基盤タスク](../../task-261008235701-recorded-motion-quality-baseline/task.md)では既存再生を利用し、最終回転の揺れ、追従の時間差、振幅と復帰を測る。

### 5. 平滑化と演出の強さが動きの再現を損なう可能性がある

One Euro Filterの後に155ミリ秒の平滑化と角速度制限がある一方、通常観測の肘座標はフィルターを通らない。どの段階で揺れを取り、どの段階で遅れが増えるかは、[同一録画の比較](../../task-261008235702-motion-filter-response/task.md)で切り分ける。現時点で「何ミリ秒改善する」とは断定しない。

[意味動作の優先規則](../../../../sincromisor-frontend/src/character/vrmPose/vrmPoseSemanticPolicy.ts)は意図の信頼度を主に見て腕の上書きを許可する。追跡側の品質を比較していないため、同期用途では高信頼の実観測を優先する。[優先順位のタスク](../../task-261008235703-tracking-semantic-arbitration/task.md)で部位ごとの補完へ変える。

### 6. 利用できる体幹・手の情報が表示へ接続されていない

[体幹の反映](../../../../sincromisor-frontend/src/character/retargeting/sincroPoseRetargetUpperBody.ts)は主に二次元の傾きと画面位置を使い、脊柱・胸のX回転は0。体幹の配分設定を持つが、本番追跡層で`upperChest`への配分は行わない。[体幹タスク](../../task-261008235703-canonical-torso-application/task.md)では座標修正後の三次元基底を使い、移動と回転を分離する。

掌方向・掌法線と前腕ねじれ配分も保存されるが、手の向きへ未接続。ただし掌特徴は画像の幅・高さ・深度の異なる尺度を含み、そのまま回転基底に使えない。[手の比較タスク](../../task-261008235703-recorded-hand-orientation-study/task.md)は録画に手の情報があることを確認してから候補を評価する。指曲げの距離比近似と関節角による候補も比較し、有効性を示せた部分だけを採用する。

## 撮影済みデータの状況

| 入力・資料               | 確認できたもの                                                                                                                     | 利用方法と限界                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 過去の実写6動作          | `neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、`arms-cross`、`fast-wave`の動画・記録・集計 | ユーザー提供の`work/private-artifacts.macbook/`に存在。1280×720、約30fps、11〜14秒。比較に使う6動画と6記録のSHA-256を保存した |
| 到達距離修正時の交差動画 | 元のSHA-256と一致する`arms-cross.browser.mp4`を確認                                                                                | 肘反転拒否1件は過去値であり現HEADの測定ではない                                                                               |
| 9月の検証動画            | `work/private-artifacts/task-260915005055-share-live-motion-computation/motion-debug-check.webm`、12秒、640×480、12fps、VP8        | 人物を含まない合成動画。読み込み・推論実行・保存の疎通専用。人体動作の品質評価には使えない                                    |
| 左右の遮蔽・復帰固定入力 | `motionEvaluation/fixtures/left-arm-occlusion-recovery.ndjson`と右腕版                                                             | 合成された決定的な系列。欠損・復帰の契約検証に使い、実写の裏付けとは区別する                                                  |

交差動画の既存記載パスは`work/private-artifacts/task-260705214026-canonical-temporal-arm-solver-production/video/arms-cross.browser.mp4`、SHA-256は`21296ea0fbd2f8655d4c20bbffe67541457ed04ddef9468eacb7fa172cd1cf54`。合成動画の実測SHA-256は`b2bc46d974898339a3713b0a299f92de5ee4c113ed34490895bc0ccf410556f2`で過去記録と一致した。

現在の保管先は`work/private-artifacts.macbook/task-260705214026-canonical-temporal-arm-solver-production/`で、`video/`に動画、`replay/`に再生記録がある。[入力目録](./recording-inventory.json)に利用するファイルとハッシュを保存した。原本の移動・公開は行っていない。

6本の`*.temporal-primary.ndjson`には合計610フレームがあり、全フレームにPose・Faceの生結果、Poseスナップショット、共通表現、時系列状態、意図、最終姿勢がある。肩の`world.raw*`も存在するため、座標修正の再計算に使える。保存された体幹は610フレームすべて`mixed`、両腕はそれぞれ610フレームすべて`suspect`だった。これは過去の保存結果の集計であり、現HEADの再推論結果ではない。記録の時刻間隔中央値は動作別で約93〜155ミリ秒で、動画の約30fpsとは異なる。`hand-out-and-return`には約299ミリ秒の間隔も1件あり、固定フレーム間隔で再生し直すと欠損・平滑化の挙動が変わる。

Handの格納欄はあるが検出成功は0フレームで、生のHand・Gesture結果もない。610フレームすべてに手推論の時刻不整合エラーが残る。手・指の比較は同じ既存動画を現在の推論経路で処理し直す必要がある。過去のエラーが現HEADでも再現するとは断定しない。

交差・手振りの代表静止画で、上半身・腰と左右の腕、交差・手振り動作が映っていることを確認した。手は画面内にある区間を含むが小さく、速い動作ではぶれもある。手の向きや指曲げの詳細な品質をこの目視だけで保証しない。代表静止画は`work/private-artifacts/`に置き、公開成果物には含めない。

参照した過去資料:

- [実写比較](../../task-260705214026-canonical-temporal-arm-solver-production/artifacts/p0-temporal-vs-pose-fallback-metrics-comparison.real-video.json)。2026年7月の値であり現在の基準値ではない。
- [到達距離の尺度修正](../../task-260712033923-temporal-arm-reach-clamp-semantics/impl.md)。最大伸展への張り付きは修正済みで、同じ問題として再起票しない。
- [交差動画の出典と集計](../../task-260712033923-temporal-arm-reach-clamp-semantics/artifacts/arms-cross-reach-replay-3runs.json)。
- [9月の検証内容](../../task-260915005055-share-live-motion-computation/task.md)。合成動画であることの根拠。

## 起票したタスクと順序

| 優先度           | タスク                                                                                             | 先行条件                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 最優先           | [座標原点・尺度を統一](../../task-261008235701-motion-coordinate-consistency/task.md)              | 固定入力で着手可能                                       |
| 最優先           | [欠損予測と復帰を最終姿勢へ反映](../../task-261008235702-motion-dropout-application/task.md)       | 固定入力で着手可能                                       |
| 最優先           | [指の観測時刻と保持期限を修正](../../task-261008235702-finger-observation-expiry/task.md)          | 欠損タスクの共通時計対応を利用                           |
| 評価の準備       | [既存撮影データによる再計算比較](../../task-261008235701-recorded-motion-quality-baseline/task.md) | 経路作成は着手可能。実写基準は提供済み原本から再計算     |
| 次段階           | [揺れと追従遅れを両立](../../task-261008235702-motion-filter-response/task.md)                     | 比較経路・座標・欠損修正                                 |
| 次段階           | [追跡優先の補助動作](../../task-261008235703-tracking-semantic-arbitration/task.md)                | 欠損・指の期限修正                                       |
| 次段階           | [体幹の三次元姿勢を反映](../../task-261008235703-canonical-torso-application/task.md)              | 座標・比較経路                                           |
| 比較して採否判断 | [手の向き・指曲げを改善](../../task-261008235703-recorded-hand-orientation-study/task.md)          | 比較経路・座標・指の期限。既存データ不足なら採用を見送る |

既存のM1実機撮影タスクは今回の前提条件にしない。意味動作・指の切り戻しフック削除も、今回の品質改善の完了条件にしない。既存タスクの状態は変更していない。

## 外部の一次資料と採用範囲

いずれも2026年10月8日に参照した。外部の説明を実測結果として扱わず、このコードへの適用は上記の調査・判断に基づく。

- [MediaPipe Pose Landmarker公式資料](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)。画像座標と腰中心のメートル単位座標を区別し、動画はフレーム時刻で処理する。本プロジェクト独自の肩幅正規化後の座標を、元のメートル座標と混同しないために参照した。
- [One Euro Filterの著者資料](https://gery.casiez.net/1euro/)。低速時の安定性と高速時の遅れを速度依存の遮断周波数で調整する。既存実装を活用し、静止時と速い動作を別々に評価する根拠とした。
- [three-vrmのVRMHumanoid API](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html)。`setNormalizedPose()`は休止姿勢に対するローカル変換を受け取り、更新時に正規化骨から元の骨へ反映される。ワールド回転をそのまま書き込まず、現在の一括適用を維持する。
- [MediaPipe Hand Landmarker公式資料](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)。手の正規化座標と手を基準にしたワールド座標を区別する。PoseとHandの座標を直接接続せず、向きと低次元の特徴量の利用を比較する。

新しい推定モデルへの全面交換、追加学習、全身IK、足接地、外部モーションAPIは今回採用しない。現時点で再現した不具合の修正に不要であり、既存録画で優位性を示す根拠もない。顔・まばたき・口形は既存の制御と修正履歴を確認したが、今回新しい品質不具合を再現していないため、変更を必須化しない。

## 固定入力の再現方法

リポジトリルートで以下を実行する。ネットワーク、ブラウザー、カメラ、ファイルへの推論結果保存を使わず、現在のTypeScript関数をVite経由で呼ぶ調査用スクリプトである。修正後は出力が変わることを期待するため、恒久的な期待値テストではない。

```sh
node tasks/character-sincro-motion/task-261008235701-recorded-motion-quality-baseline/artifacts/reproduce-findings.mjs
```

[再現出力](./reproduction-results.json)には起票時の結果を保存した。指の欠損再現は型が期待する有限値を意図的に欠かした境界入力であり、通常の録画がこの形を持つと主張するものではない。
