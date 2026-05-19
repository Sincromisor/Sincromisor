# TASK-260517042345 Sincro Motion / IK デバッグ専用ページ

- 作成日: 2026-05-17
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3116`, `TASK-260517024504`, `TASK-260517024505`, `TASK-260517024506`

## 目的

本番 UI 上では難しい IK 調整を、カメラ映像上の人の動きと VRM キャラクターの動きを同時に比較できる専用ページで行えるようにする。

このページは手動確認だけでなく、Playwright MCP / `playwright-cli` から自動操作・自動検証できることを目的にする。IK の設定変更、pose 検出待ち、snapshot 取得、スクリーンショット取得を安定した API と selector で扱えるようにし、今後の IK 調整を再現可能なデバッグ作業にする。

## 背景

現在の IK 調整は `simple-vrm` の本番 UI と Debug Console に依存している。

- RTC、チャット、テロップ、起動前 dialog、右ツールパネルが同居しており、IK だけを観察しづらい。
- カメラ映像上の MediaPipe skeleton と、VRM に反映された腕・上半身の動きが同じ画面で比較できない。
- Playwright から調整する場合、UI 操作と診断値取得の経路が Debug Console に寄りすぎている。
- `pose-landmarker-spike` は MediaPipe の性能・ランドマーク確認には使えるが、VRM retarget / IK 適用後の比較までは扱わない。

既存の `TrackerRuntime`、`SincroPoseTracker`、`SincroPoseRetargeter`、`SincroArmIkSolver`、`VRMScene` 系を再利用し、本番会話 UI とは別のデバッグ入口を用意する。

## スコープ

- Vite MPA に `motion-debug` ページを追加する。
- カメラ映像、MediaPipe pose skeleton overlay、VRM 表示を同一画面に配置する。
- `sincro` pose tracking と同じ tracker / retarget / IK 経路で VRM を動かす。
- IK 調整値を画面 UI と Playwright 用 API の両方から変更できるようにする。
- Playwright MCP / `playwright-cli` から読める安定 selector / `window` API を公開する。
- IK runtime snapshot を UI と自動検証 API の両方へ公開する。
- 必要な設計文書を更新する。

## 非対象

- 本番 `simple-vrm` UI の大幅な再設計。
- RTC signaling、音声入出力、チャット、テロップの変更。
- サーバー側 endpoint / JSON 契約変更。
- full-body IK、足接地、手指トラッキングの完成。
- IK solver 方針の再選定。
- Playwright の恒久 CI 導入。

## 実装方針

1. 専用ページを追加する。
    - `sincromisor-frontend/src/pages/motionDebug/index.html`
    - `sincromisor-frontend/src/pages/motionDebug/main.ts`
    - `sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts`
    - `sincromisor-frontend/src/pages/motionDebug/styles.css`
    - `vite.config.js` の input に `motion_debug` を追加する。
2. 本番 AppShell は使わない。
    - RTC / chat / dialog を持ち込まず、IK 観察に必要な画面だけにする。
    - 画面構成は左にカメラ映像、右に VRM、下または右ペインに runtime 値と調整 controls を置く。
3. tracker / retarget は本番経路を再利用する。
    - `TrackerRuntime` から `onPoseMotion` を受ける。
    - `CharacterBehaviorState.applyPoseMotion()` または専用 debug state adapter を通して VRM 更新へ流す。
    - 既存の `SincroPoseRetargeter` / `SincroArmIkSolver` と同じ計算結果を観察対象にする。
4. skeleton overlay を表示する。
    - `pose-landmarker-spike` の overlay 実装を参考に、カメラ映像上へ shoulder / elbow / wrist / hip などを描画する。
    - MediaPipe 生値ではなく、必要に応じて `SincroPoseMotionSnapshot` の normalized target も重ねて表示する。
5. Playwright 用 API を公開する。
    - 候補: `window.__SINCRO_MOTION_DEBUG__`
    - `startCamera()`
    - `stopCamera()`
    - `setRetargetConfig(config)`
    - `getSnapshot()`
    - `captureFrame()`
    - `waitForPoseDetected(timeoutMs)`
    - `loadVideoFixture(url)`
6. UI 要素に安定 selector を付ける。
    - `data-testid="motion-debug-start"`
    - `data-testid="motion-debug-camera-video"`
    - `data-testid="motion-debug-pose-overlay"`
    - `data-testid="motion-debug-vrm-stage"`
    - `data-testid="motion-debug-snapshot"`
    - `data-testid="motion-debug-ik-mode"`
7. 自動デバッグに必要な snapshot を整理する。
    - pose detected / confidence / fallback reason
    - left / right target quality
    - IK mode / IK weight / fallback reason
    - world target availability
    - retarget config
    - render fps / inference ms

## 実装対象候補

- `sincromisor-frontend/vite.config.js`
- `sincromisor-frontend/src/pages/motionDebug/index.html`
- `sincromisor-frontend/src/pages/motionDebug/main.ts`
- `sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts`
- `sincromisor-frontend/src/pages/motionDebug/motionDebugControls.ts`
- `sincromisor-frontend/src/pages/motionDebug/poseOverlayRenderer.ts`
- `sincromisor-frontend/src/pages/motionDebug/styles.css`
- `sincromisor-frontend/src/pages/poseLandmarkerSpike/main.ts`
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts`
- `sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts`
- `sincromisor-frontend/src/character/scene/vrmScene.ts`
- `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`
- `sincromisor-frontend/src/features/debug/model/debugConsoleManager.ts`
- `documents/design/frontend/pages.md`
- `documents/design/frontend/character/motion.md`
- `documents/design/frontend/character/tracking.md`

## 完了条件

- `http://127.0.0.1:5173/motion-debug/` で専用ページを開ける。
- Start 操作でカメラ映像、pose skeleton overlay、VRM 表示が同時に動く。
- VRM は本番 `sincro` pose retarget / IK と同じ経路で腕・上半身を更新する。
- 画面上で IK mode、strength、target scale、smoothing、min confidence を変更できる。
- `window.__SINCRO_MOTION_DEBUG__.getSnapshot()` で pose / retarget / IK runtime を取得できる。
- Playwright MCP / `playwright-cli` から `startCamera()`、`waitForPoseDetected()`、`setRetargetConfig()`、`getSnapshot()` を呼べる。
- 主要 UI に `data-testid` があり、Playwright で selector が安定している。
- `pose-landmarker-spike` と責務が重複しすぎないよう、ページの位置づけが設計文書に残っている。
- `cd sincromisor-frontend && npm run build` が成功する。
- Playwright でページ起動、snapshot 取得、スクリーンショット取得まで確認する。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev -- --host 127.0.0.1
```

```sh
playwright-cli open http://127.0.0.1:5173/motion-debug/
```

## Playwright 検証案

```ts
await page.goto("http://127.0.0.1:5173/motion-debug/");
await page.evaluate(() => window.__SINCRO_MOTION_DEBUG__.startCamera());
await page.evaluate(() =>
    window.__SINCRO_MOTION_DEBUG__.waitForPoseDetected(10_000),
);
await page.evaluate(() =>
    window.__SINCRO_MOTION_DEBUG__.setRetargetConfig({
        armIkMode: "world_3d_ik",
        armIkStrength: 1,
    }),
);
const snapshot = await page.evaluate(() =>
    window.__SINCRO_MOTION_DEBUG__.getSnapshot(),
);
```

## 設計同期メモ

この対応で設計文書に以下を反映する。

- `motion-debug` は experimental / developer page として扱う。
- `pose-landmarker-spike` は MediaPipe 性能検証、`motion-debug` は VRM retarget / IK 比較検証を担う。
- Playwright 用 debug API は本番契約ではなく、frontend developer tooling の内部 API とする。
- 本番 UI と同じ tracker / retarget / IK 経路を使うが、RTC / chat / dialog は持たない。

## 実施ログ

### 2026-05-17

- 起票。
- `motion-debug` Vite MPA page を追加。
    - `TrackerRuntime` / `CharacterBehaviorState` / `VRMScene` / `SincroPoseRetargeter` の既存経路へ接続。
    - camera preview、Sincro pose target overlay、VRM stage、IK controls、runtime snapshot panel を実装。
    - Playwright 用 `window.__SINCRO_MOTION_DEBUG__` を追加し、`startCamera()` / `stopCamera()` / `setRetargetConfig()` / `getSnapshot()` / `captureFrame()` / `waitForPoseDetected()` / `loadVideoFixture()` を公開。
    - 主要 UI に `data-testid` を追加。
- `VRMScene` の renderer sizing を親要素基準へ変更し、debug page の左右比較 pane に埋め込めるようにした。
- 設計文書を更新。
    - `documents/design/frontend/pages.md`
    - `documents/design/frontend/character/motion.md`
    - `documents/design/frontend/character/tracking.md`
- 確認。
    - `cd sincromisor-frontend && npm run build`: 成功。
    - `cd sincromisor-frontend && npm run check`: 成功（既存 lint warning は残存）。
    - `playwright-cli open http://127.0.0.1:5173/motion-debug/`: 成功。
    - Playwright から selector / `window.__SINCRO_MOTION_DEBUG__` / `setRetargetConfig()` / `getSnapshot()` / `captureFrame()` を確認。
    - desktop / mobile screenshot で VRM 表示と control layout を確認。
- 未確認。
    - この実行環境では Playwright からの camera permission / device 起動が完了しなかったため、実カメラでの `waitForPoseDetected()` 成功確認は未実施。
    - `startCamera()` は自動検証で固まらないよう camera request timeout を持つ。
- 手動確認フィードバック対応。
    - `Capture` button が無反応に見える問題を修正。
    - capture 後に preview、captured time、PNG download link を画面へ表示する。
    - Playwright で `motion-debug-capture-result` / preview image / download link の表示を確認。

### 2026-05-20 現状確認

- ページ実装は `src/pages/motionDebug/**` に配置済み。URL は引き続き `http://127.0.0.1:5173/motion-debug/`。
- `vite.config.js` は `pages/motionDebug/index.html` を `motion_debug` input と dev route alias に登録している。
- tracker / retarget / VRM / debug 参照は `src/features/**`、`src/character/**` の現行配置へ更新した。
