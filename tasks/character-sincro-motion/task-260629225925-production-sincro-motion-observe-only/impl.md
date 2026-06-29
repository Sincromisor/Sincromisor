# Implementation Log: task-260629225925-production-sincro-motion-observe-only

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- `sincroMotionObserveOnlyPipeline.ts` を production observe-only service の所有境界にした。`SincroMotionPipelineState` は保存先 contract としてそのまま使い、`CharacterBehaviorSnapshot` shape には接続していない。
- Face callback は latest Face と head reliability / canonical yaw の観測更新だけに留め、stateful な Temporal / MotionIntent の memory は Pose callback でだけ進める。Face と Pose の callback 順で temporal が二重更新されるのを避けるため。
- `mediaTimeMs` は `TrackerVideoFrameTiming.mediaTimeMs` を優先し、timing が無い stop / fallback 系 callback では sink が `performance.now()` を `receivedAtMs` として明示的に渡す形にした。estimator 内部では現在時刻を読ませない。
- mode 切替、camera refresh、tracking stop、runtime error で observe-only pipeline を reset する。VRM の現在姿勢、retarget runtime、controller 呼び出し順序は変更していない。
- Debug Console は `SincroMotionPipelineState` 本体を常時描画せず、`available` / `not_computed` / `invalid_input` と短い reason / warning count の summary だけを出す。

### review.md 申し送りへの対応

- 新規 service は `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` に追加し、依存 task の `SincroMotionPipelineState` module とは分けた。
- `SincroCharacterMotionEventSink` は service 呼び出しと summary 更新だけを持たせ、canonical / temporal / intent の詳細は service 側へ閉じた。
- `TemporalStateEstimator.reset()` と `MotionIntentEstimator.reset()` は service reset 経由で lifecycle 境界に接続した。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に observe-only service、VRM 未適用不変条件、Debug Console summary 境界を同期した。
- `documents/design/frontend/character/tracking.md` に callback timing と reset lifecycle を同期した。

### 検証

- `cd sincromisor-frontend && npm run test -- sincroMotionPipeline` PASS
- `cd sincromisor-frontend && npm run test -- temporalStateEstimator` PASS
- `cd sincromisor-frontend && npm run test -- motionIntentEstimator` PASS
- `cd sincromisor-frontend && npm run check` PASS
- `cd sincromisor-frontend && npm run build` PASS
- `npm run tasks:check` PASS

### Comment Audit

| path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | module boundary | boundary | なし | add | observe-only service は `SincroMotionPipelineState` だけを更新し、VRM bone / expression / root position、controller order、composer dry-run、`CharacterBehaviorSnapshot` を変更しない。 | module TSDoc を追加。 | VRM 適用 API / composer dry-run 生成が無いことを確認する。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `SincroMotionObserveOnlyAvailability` | public export | なし | add | `not_computed` は通常未計算、`invalid_input` は caller 境界の入力不正であり、tracking lost とは分ける。 | TSDoc を追加。 | Debug Console 表示で 3 状態が区別されること。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `SincroMotionObserveOnlyStageSummary` | public export | なし | add | 常時表示は stage summary に限定し、詳細 state は別 inspection surface で見る。 | TSDoc を追加。 | 巨大 JSON dump を React snapshot に載せていないこと。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `SincroMotionObserveOnlySummary` | public export | なし | add | reliability / canonical / temporal / intent を個別状態として表示し、Face-only / pose-only / invalid timing を切り分ける。 | TSDoc を追加。 | `DebugConsoleSnapshot.sincroMotion.observeOnly` が summary だけであること。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `SincroMotionObserveOnlyPipelineInput` | public export | なし | add | `mediaTimeMs` 優先、欠損時だけ wrapper の `receivedAtMs`、両方不正なら estimator を進めない。 | TSDoc を追加。 | estimator 内部で `performance.now()` / `Date.now()` を呼ばないこと。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `SincroMotionObserveOnlyPipelineUpdateResult` | public export | なし | add | `state` は clone 済み、`summary` は常時表示用。 | TSDoc を追加。 | caller が返却 state を変更しても内部 state に戻らないこと。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `SincroMotionObserveOnlyPipeline` | public export | なし | add | service は estimator memory を所有し、Face/Pose callback 順と VRM 未適用不変条件を守る。 | class TSDoc を追加。 | `updatePose()` 以外で Temporal / Intent を進めないこと。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `reset()` lifecycle | lifecycle | なし | add | camera source / mode を跨いで temporal filter、classification hold、intent hysteresis / cooldown を持ち越さない。 | class method と module-level function に TSDoc を追加。 | controller の mode switch / camera refresh / stop / error から呼ばれること。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | invalid input fallback | fallback | なし | add | non-finite / missing timing は snapshot 保存だけ行い、downstream estimator を進めず `invalid_input` summary で観測する。 | `SincroMotionObserveOnlyPipelineInput` と `resolveTiming` 周辺の設計を TSDoc / summary reason に反映。 | invalid timing test が reliability 未計算を確認していること。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `mediaTimeMs` 採用判断 | decision | なし | add | video frame clock を時刻正本にし、wrapper fallback を明示入力に限定する。 | module / input TSDoc に追加。 | `TrackerVideoFrameTiming.mediaTimeMs` が callback から渡ること。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | VRM に適用しない不変条件 | boundary | なし | add | observe-only は live state 計算だけで、VRM bone / expression / root position、controller order、composer dry-run を変更しない。 | module / class / `updatePose()` TSDoc と test で `composerDryRun` 未生成を確認。 | `VRMCharacterManager.update()` 周辺差分が無いこと。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | pose-only fallback | fallback | なし | add | Face / Hand 欠損は placeholder として扱い、ReliabilityMap 欠損を例外にしない。 | `updatePose()` method / module-level function TSDoc と test を追加。 | 旧 pose-only frame test が `joints.head.state === "lost"` で通ること。 |
| `sincromisor-frontend/src/app/controller/sincroCharacterMotionEventSink.ts` | `resetObserveOnlyPipeline()` | lifecycle | なし | add | sink は lifecycle reset と Debug Console summary 同期だけを持ち、VRM / retarget runtime は変更しない。 | method TSDoc を追加。 | sink が canonical / temporal / intent の実装詳細を持たないこと。 |
| `sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionRuntime.ts` | `cloneObserveOnlySummary()` | public export | なし | add | Debug Console snapshot へ流すのは summary だけで、pipeline state 本体は流さない。 | TSDoc を追加。 | warnings 配列を clone し、巨大 state を含めていないこと。 |
| `sincromisor-frontend/src/features/debug/react/panels/sincroMotionPanelFormatters.ts` | `formatObserveOnlySummary()` | public export | なし | add | 常時表示は availability、時刻、警告数に限定し、詳細値の常時 dump を避ける。 | TSDoc を追加。 | panel が summary 文字列だけを描画すること。 |

### 残リスク

- Hand snapshot callback は本タスクの受け入れ条件外のため production sink へは新規接続していない。service input は optional `hand` を受けられる形にしてある。
- build では既存の Vite chunk size warning が出るが、本変更による新規失敗ではない。

### Comment Audit Addendum

構造ガードを避けるため、observe-only の公開型と summary / timing helper は
`sincroMotionObserveOnlyPipelineTypes.ts` へ分割し、required public types は
`sincroMotionObserveOnlyPipeline.ts` から re-export した。分割後の audit 補足は次の通り。

| path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipelineTypes.ts` | `SincroMotionObserveOnlyAvailability` | public export | 分割前に service file へ追加済み | keep | `not_computed` と `invalid_input` の違いは Debug Console と evaluator が確認する主要契約。 | TSDoc を helper file へ移動し、service file から re-export。 | main service file から import 互換が保たれていること。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipelineTypes.ts` | `SincroMotionObserveOnlyPipelineInput` | public export | 分割前に service file へ追加済み | keep | `mediaTimeMs` 優先、`receivedAtMs` fallback、両方不正時の `invalid_input` を型境界で説明する必要がある。 | TSDoc を helper file へ移動し、service file から re-export。 | estimator 内部の現在時刻参照が無いこと。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipelineTypes.ts` | `SincroMotionObserveOnlyPipelineUpdateResult` | public export | 分割前に service file へ追加済み | keep | clone 済み state と常時表示 summary の分離が Debug Console 境界。 | TSDoc を helper file へ移動し、service file から re-export。 | 巨大 state dump を常時描画していないこと。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipelineTypes.ts` | `resolveObserveOnlyTiming()` | public export | なし | add | timing fallback は wrapper 側の明示入力に限定し、invalid timing では estimator を進めない。 | TSDoc を追加。 | invalid input test が `media_time_missing` を確認していること。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipelineTypes.ts` | `normalizeObserveOnlyVideoSize()` | public export | なし | add | DOM を service へ持ち込まず、video size 欠損でも pose-only fallback を継続する。 | TSDoc を追加。 | helper が DOM / video element を受け取らないこと。 |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipelineTypes.ts` | `summarizeObserveOnlyStage()` | public export | なし | add | summary は warnings を短く切り詰め、詳細 state inspection は別 surface に委ねる。 | TSDoc を追加。 | Debug Console snapshot が summary だけを保持すること。 |

## attempt 2

### 判断

- 評価 FAIL は `SincroMotionObserveOnlyTiming` の public export comment audit 漏れだけだったため、機能コードの挙動は変えず TSDoc と audit artifact のみ補った。
- `SincroMotionObserveOnlyTiming` は `resolveObserveOnlyTiming()` の戻り値として外部 test / debug helper が読む可能性があるため public export のまま維持した。
- ドキュメント同期は不要。公開挙動、通信契約、Debug Console 表示、設計境界は attempt 1 から変更しておらず、今回の変更は production TypeScript comment quality の補完だけである。

### 検証

- `cd sincromisor-frontend && npm run check` PASS
- `cd sincromisor-frontend && npm run test -- sincroMotionPipeline` PASS
- `npm run gate` PASS

### Comment Audit Addendum

| path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipelineTypes.ts` | `SincroMotionObserveOnlyTiming` | public export | なし | add | `mediaTimeMs` は downstream estimator / saved state timestamp、`updatedAtMs` は Debug Console の runtime 更新時刻であり、Tracker timing が有効なら分離される。`mediaTimeMs` 欠損時だけ `receivedAtMs` を fallback し、両方不正な `invalid_input` では snapshot 保存と summary 更新だけ行い Temporal / MotionIntent estimator を進めない。 | TSDoc を追加。 | evaluator は `resolveObserveOnlyTiming()` の戻り型に失敗条件、fallback、2 種の時刻の意味、downstream 停止契約が書かれていることを確認する。 |
