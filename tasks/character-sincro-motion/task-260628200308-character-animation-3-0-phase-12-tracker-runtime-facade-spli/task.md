# character animation 3.0 phase 12 tracker runtime facade split

## 背景 / 目的

`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts` は 977 行あり、video frame loop、Worker / main-thread 推論、engine fallback、ROI budget、ordered degradation policy、stats 生成、callback publish が 1 class に集まっている。`documents/design/frontend/character/tracking.md:42` は TrackerRuntime が camera track、video element、推論 loop、Worker fallback を所有すると定義しているが、実装詳細が同一ファイルに集中しており、境界理由のコメントも少ない。

このタスクでは `TrackerRuntime` の公開 API を維持しつつ、runtime facade と内部 strategy / helper に分割し、Worker fallback と degradation の所有境界を読みやすくする。

依存:

- `task-260628200308-character-animation-3-0-phase-12-code-structure-guard`

## 完了条件（受け入れ条件）

- [ ] `trackerRuntime.ts` は `export class TrackerRuntime` の public facade と lifecycle state の接続に絞る。
- [ ] `TrackerRuntime` の constructor、`startFaceTracking()`、`stopFaceTracking()`、`dispose()` の signature と挙動を変えない。
- [ ] `trackerRuntime.ts` から次の module へ責務を分割する。
    - `trackerRuntimePredictionPlan.ts`: face / pose / hand / face ROI を走らせるかの cadence 判定結果を作る pure helper。
    - `trackerRuntimeMainThreadPipeline.ts`: main-thread 推論順序、callback publish、ROI stats 接続。
    - `trackerRuntimeWorkerPipeline.ts`: Worker detect、ImageBitmap transfer、worker failure 時の fallback 起点。
    - `trackerRuntimeDegradationApplication.ts`: degradation policy decision の runtime state 反映、effective cadence 反映。
    - `trackerRuntimeStats.ts`: main-thread stats と budget / policy / ROI stats の合成。
    - `trackerRuntimeRoiSnapshot.ts`: Face ROI metadata clone / paused warning / skipped reason helper。
- [ ] 各新規 production module は原則 300 行以下にする。超える場合は同じ行に `// reason: structure-threshold-exception <理由>` を付ける。
- [ ] `SincroTrackerWorkerStats` の shape、degradationPolicy snapshot、ROI stats、fallback stats を変更しない。
- [ ] Worker 経路が失敗した場合は現状どおり main-thread fallback へ切り替え、fallback 中の target fps clamp を維持する。
- [ ] `ignorePerformanceFallback` の意味を変えない。face-only / comfortable-idle への自動遷移だけを抑制し、reduced fps / ROI pause stage は残す。
- [ ] TrackerRuntime class の直前コメントに、DOM / video / Worker 所有境界、UI / VRM / canonical / reliability を所有しないことを日本語で明記する。
- [ ] Worker fallback、Pose stale for ROI、ordered degradation stage のような非自明な判断に日本語コメントを追加する。
- [ ] `documents/design/frontend/character/tracking.md` の TrackerRuntime responsibilities に、分割後の内部 module 境界を同期する。
- [ ] structure guard の本タスク責任範囲は、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts` と本タスクで新規作成・変更した production `.ts` module に限定する。これらは 300 行以下、または同じ行に `// reason: structure-threshold-exception <理由>` を持つ。
- [ ] `npm run tasks:check:frontend-structure` は実行して出力を `impl.md` に記録する。現行 branch では `git diff main` 由来の既存 strict failure が本タスク範囲外にも出るため、コマンド全体が非 0 でも即 FAIL にはしない。本タスク範囲外の failure は「pre-existing branch-wide strict failure」として path 一覧を記録し、本タスクで変更したファイルに failure が残っていないことを確認する。

## 設計判断（着手前に確定済み）

- public class facade は維持する。`MotionDebugApp` など既存 caller が `new TrackerRuntime(video)` と lifecycle method に依存しているため。
- main-thread pipeline と worker pipeline を分ける。両者は同じ callback を publish するが、frame transfer / fallback / stats の失敗モードが異なるため。
- cadence 判定は prediction plan helper に分ける。`last*InferenceAtMs` と effective fps の扱いを 1 箇所に閉じることで、worker と main-thread のずれを減らす。
- degradation application は policy controller から分ける。policy は「決定」、runtime application は「TrackerRuntime state と cadence への反映」であり、責務が違うため。
- 外部境界は DOM video element、MediaStreamTrack、Worker、MediaPipe tracker である。network、LLM、DB、外部 telemetry は使わない。Worker / MediaPipe 例外は現状どおり fallback / stop snapshot に落とす。

## スコープ境界

- 本タスクでやること:
    - `trackerRuntime.ts` の facade 化と内部 module 分割。
    - Worker / main-thread / degradation / stats の責務コメント追加。
    - tracking design doc 同期。
- 本タスクでやらないこと:
    - tracker cadence / budget threshold の変更。
    - Worker message schema の変更。
    - MediaPipe model path の変更。
    - camera permission / UI の変更。
    - motion-debug page controller の分割。
- 依存タスクとの境界:
    - code structure guard は悪化防止を提供する。本タスクは TrackerRuntime 内部だけを分割し、motion-debug 側の orchestration は別タスクに残す。
    - code structure guard の strict 対象は branch-wide な `git diff main --name-only -- sincromisor-frontend/src` である。本タスクはその出力全体の解消ではなく、TrackerRuntime 分割で触るファイルだけを structure threshold に適合させる。既存 branch-wide failure の一括解消は別タスクに残す。

## 実装方針（既存コード整合: file:line）

- `TrackerRuntime` public class は `trackerRuntime.ts:65` にある。class 名と public lifecycle method は維持する。
- start lifecycle は `trackerRuntime.ts:101` から始まり、tracking options、profile、worker engine、video attach をまとめている。facade はここで state を初期化し、詳細を helper に委譲する。
- main-thread prediction は `trackerRuntime.ts:276` 以降にあり、pose / face ROI / face / hand / stats の順序を持つ。この順序は維持する。
- worker prediction は `trackerRuntime.ts:337` 以降にあり、ImageBitmap transfer と worker detect を行う。この経路を worker pipeline module へ移す。
- Pose stale threshold は `trackerRuntime.ts:61` の `POSE_STALE_FOR_ROI_THRESHOLD_MS = 250` で定義されている。この値と意味は変えない。
- tracking design doc は TrackerRuntime の責務を `documents/design/frontend/character/tracking.md:42` 以降で説明している。内部 module 境界をこの周辺へ追記する。

## テスト

- `cd sincromisor-frontend && npm run test -- trackerRuntime`
- `cd sincromisor-frontend && npm run test -- trackerRuntimeCadence`
- `cd sincromisor-frontend && npm run test -- trackerRuntimeDegradationPolicy`
- `cd sincromisor-frontend && npm run test -- trackerRuntimeRoiBudget`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check:frontend-structure`（非 0 の場合は、本タスクで変更した file の failure がないことと、本タスク範囲外の pre-existing failure 一覧を `impl.md` に記録する）
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、TrackerRuntime は developer-visible stats / degradationPolicy / ROI stats の出力境界であり、内部責務分割を `documents/design/frontend/character/tracking.md` に同期する。
