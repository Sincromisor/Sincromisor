# Implementation Log: task-260712033923-temporal-arm-reach-clamp-semantics

## attempt 1

### 判断と変更

- 原因は tracker の torso-normalized `bodyLocalWrist` と avatar meter の尺度混在だった。旧 bridge は body-local tuple から avatar meter の `shoulderLocal` を直接減算し、その長さを reach としていたため、canonical arms-cross の bridge 前 ratio が過大になっていた。
- 修正後は body-local tuple を target 方向にだけ使い、長さを temporal `arm.reach * avatarArmLength * defaultReachScale` とした。`maxReachRatio` と avatar arm length は変更していない。
- bridge clamp 前 requested、solver 最終 target の applied、正の差 excess、単一 `clampedBy` ownership を Phase 6 v1 optional `reach` として追加した。solver clamp を bridge より優先し、旧 log の reach 欠損 parse は維持した。
- `solverExcessReachRatioP95` を summary / threshold / comparison / baseline fallback / viewer の固定 metric key 経路へ追加した。全 arm-frame に診断がなければ部分 sample を使わず `reach_diagnostics_not_recorded` にする。

### canonical video 3 run

- artifact: `artifacts/arms-cross-reach-replay-3runs.json`
- input SHA-256（全 run 同一）: `21296ea0fbd2f8655d4c20bbffe67541457ed04ddef9468eacb7fa172cd1cf54`
- 同じ canonical video 由来の captured replay frames を修正後 semantics で3回評価し、全 run は決定的に同一結果だった。
- `solverExcessReachRatioP95 = 0.008224083463538867`、elbow flip reject `1`、NaN / side swap / owned bone conflict は各 `0`。
- 左: requested min/p95/max `0.710982/1.001111/1.017552`、applied min/max `0.710982/0.985`、excess p95 `0.016111`、clampedBy bridge/solver/none `24/0/110`、source state suspect `134`。
- 右: requested min/p95/max `0.546692/0.908651/0.913055`、applied min/max `0.546692/0.913055`、excess p95 `0`、clampedBy bridge/solver/none `0/0/134`、source state suspect `134`。

### 視認所見

- 修正前: body-local の大きさを avatar meter と誤認したため両腕がほぼ常時 full reach へ張り付き、arms-cross 中の手首が胸前を横切る奥行きと肘の曲がりが潰れやすかった。
- 修正後: body-local の符号と anisotropic scale による target 方向は維持したまま、temporal scalar の長さが反映される。左右の side は交換されず、手から胸への交差方向と最終 pose を維持しつつ、腕が不必要に最大伸展へ張り付く状態を解消した。

### TypeScript production comment audit

| path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `motionSolver/temporalArmSolverBridge.ts` | `bodyLocalWristToShoulderLocal` / ratio coordinate and denominator | coordinate heuristic | 旧 `createTemporalArmIkInput` TSDoc は source boundary のみ | add | body-local は torso-normalized、ratio 分母は avatar upper+lower arm meter、tuple は方向、scalar は長さ | 専用関数へ分離し理由・尺度契約をコメント | `maxReachRatio` を品質調整していない |
| `retargeting/sincroPoseRetargeter.ts` | `createArmReachSnapshot` / bridge-solver clamp ownership | ownership decision | なし | add | requested は bridge 前、applied は solver 最終 target、両 clamp 時は solver 優先、同一 frame を二重計上しない | helper と契約コメントを追加 | 型から自明でない優先規則のみ記載 |
| `motionEvaluation/motionDebugPhase6Snapshot.ts` | optional `reach` schema / legacy fallback | replay compatibility | module contract comment のみ | keep/add through type and schema | v1を維持し旧 log 欠損を許容、finite と excess invariant を parser で拒否 | optional schema、serializer、normalizerを同期 | 旧 log へ偽の0を補完しない |
| `motionEvaluation/motionMetricSolverCalculators.ts` | `calculateSolverExcessReachRatioP95` / p95 sample policy | metric policy | solver group comment のみ | add | nearest-rank、左右全 arm-frame、欠損1件でも部分sample禁止、固定 unavailable reason | exported function TSDoc と実装を追加 | 短時間の超過を欠損除外で隠さない理由を記載 |
| `ik/sincroArmIkSolver.ts` | solver final reach diagnostics | solver output | class comment は two-bone solver の目的を説明済み | keep | final applied ratio は constraint/collision後の solver target / solver arm length | result fieldsへ集約し追加コメントなし | 型名・式から明らかな逐語コメントを避けた |
| `motionMetricThresholds.ts` / summary / comparison | fixed key propagation | contract plumbing | fixed-key maintenance TSDocあり | keep | key追加時はthreshold/definition/summary/comparisonを同期 | existing contract commentに従い全 facade を同期 | 定型コメントを増やしていない |

### Verification

- focused: bridge / Phase 6 parser / metric tests PASS。
- `npm run gate`: lint PASS、build PASS、test PASS（71 files / 490 tests）。

### 逸脱・詰まり

- なし。artifact は video bytes 自体を複製せず、同一 SHA と run別記録、集計値を保存した。

## attempt 2

### evaluator 残課題への対応

- bridge input validation は upper / lower / total arm length の finite 性だけでなく `> 0` を要求するよう修正した。0 または負値は `invalid_temporal_arm` となり、target と reach を保存しない focused test を追加した。
- solver result は solver 固有分母で計算済み ratio を返さず、最終 `appliedTargetLength` を返す。`createArmReachSnapshot()` が requested と applied の両方を `bridge.scale.armLength` で割るため、profile measurement と solver measurement が異なっても共通分母になる。
- bridge-only / solver-only / no-clamp を production 統合 helper で直接検証し、solver ownership 優先と共通分母を固定した。
- p95 は旧 log reach 欠損、片腕だけ欠損、0 sample、20 sample nearest-rank 境界を focused test に追加した。欠損系はすべて部分 sample を返さず `reach_diagnostics_not_recorded` となる。
- artifact の各 `runs[]` に `diagnosticsRef` と同一 `diagnosticsIdentity` を追加した。各 run は同一 SHA と同一左右診断値/source内訳を参照するため、3 run の同一性を構造的に照合できる。

### comment audit 追補

| path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `motionSolver/temporalArmSolverBridge.ts` | `temporalArmInputIsFinite` / non-positive measurement | invalid input boundary | public bridge TSDoc が invalid input fallback を説明 | keep code self-evident | upper / lower / total arm length が非正なら ratio を作らず `invalid_temporal_arm` | boolean predicate と boundary testを追加 | 偽の0 ratioやNaNを保存しない |
| `ik/sincroArmIkTypes.ts` | `SincroArmIkSolveResult.appliedTargetLength` | solver diagnostic contract | exported type fields | rename/rewrite | solver は最終 target の物理長だけを返し、consumer の診断分母を先取りしない | attempt 1 の `appliedReachRatio` を削除し `appliedTargetLength` へ変更 | solver/profile measurement差を許容するため必要 |
| `ik/sincroArmIkSolver.ts` | final applied target capture | solver output decision | class TSDoc が solver目的を説明 | keep | constraint / collision / reach clamp 後の target 長を返す | prepared final target から length を保存 | 逐語コメントは追加しない |
| `retargeting/sincroPoseRetargeter.ts` | exported `createArmReachSnapshot` | production integration contract | ownership TSDocあり | update through implementation | requested/applied は共通して bridge scale arm length 分母、solver clamp優先 | helperをexportして統合境界テストを追加 | bridge-only / solver-only / none を直接検証 |
| `motionEvaluation/motionDebugPhase6Snapshot.ts` | `phase6ArmSolverSnapshotSchema` / `serializeArmSolverSnapshot` / `normalizePhase6ArmSolverSnapshot` | schema/parser/serializer | module contract TSDocあり | keep | optional reach、finite/invariant、旧log欠損維持を3境界で同期 | attempt 1実装をfocused legacy testで補強 | 各symbolを明示監査済み |
| `motionEvaluation/motionMetricSolverCalculators.ts` | `calculateSolverExcessReachRatioP95` | missing/nearest-rank policy | policy TSDocあり | keep | 全arm-frame必須、0 sample unavailable、ceil(0.95*n)-1 | 旧log/片腕欠損/0/20 sample境界test追加 | 部分sample fallbackなし |
| `motionEvaluation/motionMetricSummary.ts` / `motionMetricThresholds.ts` / `motionMetricComparison.ts` / `motionMetricBaselineSchema.ts` / `motionOptimizationCandidateReport.ts` | metric facade propagation | fixed-key plumbing | thresholds/facade contract commentsあり | keep | summary、viewer、comparison、旧baseline補完を同じkeyで結ぶ | attempt 1差分を再照合 | 追加の定型コメント不要 |

### Verification

- focused tests: bridge invalid lengths、measurement mismatch + ownership 3種、p95 missing / legacy / zero / nearest-rank PASS。
- full gate は attempt 2 commit 前後に実行する。

### 逸脱・詰まり

- なし。
