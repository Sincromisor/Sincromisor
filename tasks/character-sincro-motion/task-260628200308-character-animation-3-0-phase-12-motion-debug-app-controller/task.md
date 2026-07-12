# character animation 3.0 phase 12 motion debug app controller split

## 背景 / 目的

`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts` は 1163 行あり、DOM wiring、camera / fixture source、TrackerRuntime 接続、recording、replay、metrics、optimization candidate、viewer snapshot、VRM scene 更新、window API binding が 1 class に集中している。`documents/design/frontend/pages.md:51` は motion-debug を developer page として定義し、`documents/design/frontend/character/motion.md:69` 以降は motion-debug の多数の developer API / viewer 責務を説明しているが、実装上の境界が読み取りにくい。

このタスクでは `MotionDebugApp` の公開 window API と画面挙動を維持しつつ、page controller を責務別に分割し、motion-debug が所有する境界と所有しない境界をコメントで明確化する。

依存:

- `task-260628200308-character-animation-3-0-phase-12-code-structure-guard`
- `task-260628200308-character-animation-3-0-phase-12-tracker-runtime-facade-spli`

## 完了条件（受け入れ条件）

- [ ] `motionDebugApp.ts` は `export class MotionDebugApp` の facade と high-level wiring に絞る。
- [ ] `window.__SINCRO_MOTION_DEBUG__` の既存 API 名、引数、戻り値を変えない。
- [ ] `MotionDebugApi` の既存型を破壊しない。新 API 追加は本タスクでは行わない。
- [ ] `motionDebugApp.ts` から次の module へ責務を分割する。
    - `motionDebugVrmUrl.ts`: `?vrm=` の same-origin / `/characters/` validation。
    - `motionDebugCameraRuntime.ts`: camera / fixture stream の start / stop / active source state。
    - `motionDebugTrackerBridge.ts`: TrackerRuntime callback から face / pose / hand / tracker stats / camera quality を MotionDebugApp state へ反映する接続。
    - `motionDebugReplayRuntime.ts`: replay load / start / step / stop と replay timer 所有。
    - `motionDebugMetricsRuntime.ts`: replay metrics、QA regression、optimization candidate API の集約。
    - `motionDebugWindowApi.ts`: `window.__SINCRO_MOTION_DEBUG__` binding。
    - `motionDebugSceneRuntime.ts`: VRMScene update、retarget config、render FPS / snapshot render cadence の接続。
- [ ] 各新規 production module は原則 300 行以下にする。超える場合は同じ行に `// reason: structure-threshold-exception <理由>` を付ける。
- [ ] camera / fixture / replay stop 時の cleanup と temporal / intent estimator reset のタイミングを変えない。
- [ ] loaded recording がない場合の replay / metrics / QA API error code を変えない。
- [ ] `getMotionDebugVrmUrl()` 相当の validation は same-origin かつ `/characters/` 配下だけを許可する現状挙動を維持する。
- [ ] `MotionDebugApp` class の直前コメントに、motion-debug page が DOM / camera source / recording / replay / developer window API を所有し、RTC / chat / backend contract を所有しないことを日本語で明記する。
- [ ] replay mode、metrics mode、VRM URL validation、recording download のような境界判断に日本語コメントを追加する。
- [ ] `documents/design/frontend/pages.md` と `documents/design/frontend/character/motion.md` に、motion-debug page controller の内部 module 境界を同期する。

## 設計判断（着手前に確定済み）

- `MotionDebugApp` facade は維持する。entry point と window API binding の既存構造を壊さず、内部 controller を切り出す方が差分を局所化できるため。
- window API binding は専用 module に分ける。developer API の公開面と内部 state 更新が同じ class に混ざると、後続 API 追加時に破壊的変更を見落としやすいため。
- camera runtime と tracker bridge を分ける。MediaStream / fixture video の所有と、TrackerRuntime callback の保存 state 反映は責務が違うため。
- replay runtime と metrics runtime を分ける。replay playback と replay log analysis は同じ source を読むが、timer / scene application と pure analysis の失敗モードが異なるため。
- 外部境界は browser DOM、MediaStream、File / NDJSON replay input、developer window API だけである。backend network、RTC、chat、LLM、DB は使わない。

## スコープ境界

- 本タスクでやること:
    - `motionDebugApp.ts` の facade 化と page-specific controller 分割。
    - window API / camera / replay / metrics / scene 接続の境界コメント追加。
    - pages / motion design doc 同期。
- 本タスクでやらないこと:
    - motion-debug UI の見た目変更。
    - 新しい window API の追加。
    - replay log schema の変更。
    - TrackerRuntime 内部の分割。
    - WebRTC / chat / app shell の変更。
- 依存タスクとの境界:
    - TrackerRuntime facade split は tracking runtime 内部を整理する。本タスクは page 側 orchestration のみを分割し、tracker cadence / Worker fallback の仕様は変更しない。

## 実装方針（既存コード整合: file:line）

- `MotionDebugApp` public class は `motionDebugApp.ts:149` にある。class 名と entry point は維持する。
- VRM URL validation は `motionDebugApp.ts:110` から始まる `getMotionDebugVrmUrl()` にある。same-origin / `/characters/` 配下 validation を `motionDebugVrmUrl.ts` へ移す。
- QA regression は `motionDebugApp.ts:524`、optimization candidate analysis は `motionDebugApp.ts:571` にある。metrics runtime module へ移すが error code は維持する。
- window API binding は `motionDebugApp.ts:1090` 付近にある。`motionDebugWindowApi.ts` に移し、API surface を一覧で読めるようにする。
- `MotionDebugApi` 型は `types.ts:283` にあり、`runQaRegression` は `types.ts:306` にある。既存型は破壊しない。
- `documents/design/frontend/pages.md:51` は motion-debug の developer page 責務を説明している。page controller の内部 module 境界をここへ追記する。
- `documents/design/frontend/character/motion.md:69` 以降は motion-debug の API / replay / metrics 責務を説明している。実装責務分割をこの節へ同期する。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugRecordingController`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugCameraStream`
- `cd sincromisor-frontend && npm run test -- motionQaRegression`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check:frontend-structure`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、motion-debug は developer-visible window API と replay / metrics workflow を持つため、`documents/design/frontend/pages.md` と `documents/design/frontend/character/motion.md` に内部 module 境界を同期する。
