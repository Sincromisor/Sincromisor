# character animation 3.0 motion debug layered viewer

## 背景 / 目的

Phase 1 の完了条件には、`motion-debug` で MediaPipe raw、reliability、canonical、temporal、solver、final pose を層別に見られることが含まれる。Phase 1 時点では canonical / temporal / intent の中身はまだ optional slot だが、UI と window API は「どの層に値があり、どの層が未実装 / 未記録か」を分けて表示できる必要がある。

このタスクでは、record / replay / metrics の結果を `motion-debug` 上で層別に確認する viewer を追加し、Phase 2 以降の canonical contract 実装が自然に接続できる枠を作る。

## 完了条件（受け入れ条件）

- [ ] `motion-debug` の snapshot panel を、`live`、`recording`、`replay`、`metrics` の表示 mode へ分ける。既存の raw JSON 表示は debug detail として残す。
- [ ] layer selector は `camera`、`mediapipe`、`poseSnapshot`、`reliability`、`canonical`、`temporal`、`intent`、`solver`、`finalPose`、`applied`、`metrics` を持つ。layer status と表示文言は本タスクの「設計判断」にある判定表へ固定し、空 object を成功表示しない。
- [ ] `MotionDebugSnapshot` に追加する optional field は `viewer` に固定し、最小 schema は本タスクの「設計判断」にある `MotionDebugViewerSnapshot` とする。
- [ ] record 中は frame count、duration、compression fallback、scrubbed camera settings の有無を表示する。
- [ ] replay 中は replay mode、current frame index、source timestamp、determinism check result、latest `poseRetarget` summary を表示する。
- [ ] metrics view は `MotionMetricSummary` の metric key、value、status、severity、threshold、baseline comparison を表で表示する。`not_available` は PASS 色にしない。
- [ ] `window.__SINCRO_MOTION_DEBUG__.getSnapshot()` は viewer state を含むが、既存 `status`、`camera`、`pose`、`tracker`、`poseRetarget`、`poseRetargetRuntime`、`render` の field 名を壊さない。
- [ ] Playwright または DOM unit test で、import した minimal valid log の replay state と metrics summary が画面上に表示されることを確認する。

## 設計判断（着手前に確定済み）

- UI は新しい standalone page を作らず、既存 `pages/motionDebug` を拡張する。Phase 1 の評価ハーネスは本番 retarget 経路と同じ画面で確認する必要があるため。
- 表示 mode と layer selector は page-specific state とし、`src/character/motionEvaluation/` の pure logic に DOM 依存を入れない。
- canonical / temporal / intent は Phase 1 では optional placeholder として扱う。viewer は slot の存在と warning を表示するだけで、値の意味解釈は Phase 2 以降に委ねる。
- 既存 window API の backward compatibility は維持する。Playwright や既存調整タスクが `getSnapshot().poseRetarget` を読める状態を壊さない。
- 見た目の大改修はしない。開発者向けページとして、情報密度が高く、値の有無と層の境界を素早く確認できることを優先する。

viewer mode は user selectable とし、初期値は `"live"`。recording 開始時は `"recording"`、replay 開始時は `"replay"`、`calculateReplayMetrics()` 成功時は `"metrics"` へ自動遷移する。ユーザーが mode selector を変えた場合はその選択を優先する。metrics summary がない状態で `"metrics"` を選んだ場合は `"not recorded"` ではなく `"not calculated"` を表示する。

`MotionDebugSnapshot.viewer` の最小 shape:

```ts
type MotionDebugViewerMode = "live" | "recording" | "replay" | "metrics";
type MotionDebugLayerKey =
    | "camera"
    | "mediapipe"
    | "poseSnapshot"
    | "reliability"
    | "canonical"
    | "temporal"
    | "intent"
    | "solver"
    | "finalPose"
    | "applied"
    | "metrics";

type MotionDebugLayerStatus =
    | "available"
    | "not_recorded"
    | "not_implemented"
    | "not_calculated";

type MotionDebugViewerSnapshot = {
    mode: MotionDebugViewerMode;
    selectedLayer: MotionDebugLayerKey;
    layers: Record<
        MotionDebugLayerKey,
        { status: MotionDebugLayerStatus; label: string; value?: unknown }
    >;
    recording?: Pick<
        MotionDebugRecorderState,
        | "status"
        | "frameCount"
        | "durationMs"
        | "compression"
        | "compressionFallbackReason"
    >;
    replay?: Pick<
        MotionReplayState,
        "status" | "mode" | "frameCount" | "currentFrameIndex" | "lastResult"
    >;
    metrics?: MotionMetricSummary;
};
```

layer 判定表:

| layer          | source                               | slot が値あり | slot 欠落        | `{}`             | Phase 1 予約のみ                            |
| -------------- | ------------------------------------ | ------------- | ---------------- | ---------------- | ------------------------------------------- |
| `camera`       | live snapshot / manifest camera      | `available`   | `not_recorded`   | `not_recorded`   | なし                                        |
| `mediapipe`    | `frame.mediapipe`                    | `available`   | `not_recorded`   | `not_recorded`   | raw serializer 未実装なら `not_implemented` |
| `poseSnapshot` | `frame.poseSnapshot` or live `pose`  | `available`   | `not_recorded`   | `not_recorded`   | なし                                        |
| `reliability`  | `frame.reliability`                  | `available`   | `not_recorded`   | `not_recorded`   | Phase 1 では `not_implemented`              |
| `canonical`    | `frame.canonical`                    | `available`   | `not_recorded`   | `not_recorded`   | Phase 1 では `not_implemented`              |
| `temporal`     | `frame.temporal`                     | `available`   | `not_recorded`   | `not_recorded`   | Phase 1 では `not_implemented`              |
| `intent`       | `frame.intent`                       | `available`   | `not_recorded`   | `not_recorded`   | Phase 1 では `not_implemented`              |
| `solver`       | `frame.solver` / live `poseRetarget` | `available`   | `not_recorded`   | `not_recorded`   | なし                                        |
| `finalPose`    | `frame.finalPose`                    | `available`   | `not_recorded`   | `not_recorded`   | composer 未実装なら `not_implemented`       |
| `applied`      | `frame.applied`                      | `available`   | `not_recorded`   | `not_recorded`   | composer 未実装なら `not_implemented`       |
| `metrics`      | `MotionMetricSummary`                | `available`   | `not_calculated` | `not_calculated` | なし                                        |

テスト fixture は `manifest + 2 frame` の plain NDJSON とし、frame には `poseSnapshot` と `solver.poseRetarget` を含める。metrics view は manifest の `metricSummary` ではなく、依存タスクの `calculateReplayMetrics()` が返す `MotionMetricSummary` を入力にする。

## スコープ境界

- 本タスクでやること:
    - `motion-debug` UI の表示 mode / layer selector。
    - recording / replay / metrics state の表示。
    - optional layer の missing / not implemented 表示。
    - 既存 window API snapshot の拡張。
- 本タスクでやらないこと:
    - recorder / replay / metrics core の新規設計変更。
    - canonical state の値計算。
    - final VRM pose composer の導入。
    - marketing 的な説明 UI や一般ユーザー向け onboarding。

## 実装方針（既存コード整合: file:line）

- 現行 HTML は stage、control panel、snapshot `<pre>` の単純構成である（`sincromisor-frontend/src/pages/motionDebug/index.html:30`、`sincromisor-frontend/src/pages/motionDebug/index.html:138`）。viewer はこの workbench に mode selector と layer panel を追加する。
- `MotionDebugControls.renderSnapshot()` は現在 `JSON.stringify(snapshot, null, 2)` を直接 `<pre>` に入れている（`sincromisor-frontend/src/pages/motionDebug/motionDebugControls.ts:72`）。本タスクでは raw JSON detail と要約表示を分ける。
- `MotionDebugSnapshot` の field は `types.ts` で定義されている（`sincromisor-frontend/src/pages/motionDebug/types.ts:23`）。viewer state は optional field として追加し、既存 field の rename はしない。
- `MotionDebugApp.startRenderLoop()` は snapshot を約 180ms 間隔で描画している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:315`）。viewer も同じ refresh cadence に乗せ、別 timer を増やさない。
- `documents/design/frontend/character/motion.md:92` は `motion-debug` snapshot が camera readiness、render fps、pose / retarget runtime を返すと定義している。viewer 追加後の snapshot 拡張を同期する。

## テスト

- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run test -- motionDebug`
- Playwright で `motion-debug` を開き、minimal valid log を window API から import して、viewer に replay state と metrics summary が表示されることを確認する。Playwright が使えない場合は DOM 操作を分離した unit test で代替し、未実行理由を `impl.md` に残す。
- viewport 幅を desktop / mobile 相当へ変えて、layer selector と metrics table の text が重ならないことを確認する。
- `npm run tasks:check`

## ドキュメント同期の要否

要。`documents/design/frontend/character/motion.md` に viewer mode、layer selector、window API snapshot 拡張を同期する。`documents/design/frontend/pages.md` に `motion-debug` のページ説明がある場合は、developer page としての record / replay / metrics 表示を追記する。
