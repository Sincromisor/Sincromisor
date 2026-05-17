# TASK-260517134246 frontend file function size split

- 作成日: 2026-05-17
- ステータス: Open
- 優先度: Medium
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

TypeScript / TSX の巨大ファイル・巨大関数を責務単位で分割し、読み流せない長さによる debug コストを下げる。

## 背景

`AGENTS.md` ではファイル 200 行 soft / 300 行 hard、関数 40 行 soft / 60 行 hard、引数 3 個 soft / 4 個 hard を閾値としている。2026-05-17 時点で、ファイル hard 超過 20 件、関数 hard 超過 34 件、引数 hard 超過 14 件がある。

UI 更新 / 外部 I/O / 純粋計算が混在している箇所は、行数に関わらず分割対象になる。

## スコープ

- hard 超過ファイルの優先分割
- hard 超過関数の private 関数または別モジュールへの抽出
- 引数数超過関数の options object 化
- テスト都合ではなく責務境界に基づく export 整理
- 複数主要 export ファイルの分割方針整理

## 非対象

- 命名規約リネームの全面対応
- runtime schema 導入そのもの
- UI デザインの大幅変更
- WebRTC contract の変更

## 優先対象

- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts`
- `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/react/settings-fields/SettingsFields.tsx`
- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseTracker.ts`
- `sincromisor-frontend/src/react/debug/panels/SincroMotionPanel.tsx`

## 関数分割候補

- `SimpleVrmControlPanel`
- `AudioPanel`
- `ConfigurationDialogSettingsPanel`
- `SincroMotionPanel`
- `useSimpleVrmPanelState`
- `GazePanel`
- `LookingGlassSettingsSection`
- `collectAndRenderStats`
- `normalizeResult`
- `retargetArm`
- `negotiate`
- `buildProcessedAudioTrack`

## 実装方針

1. 1 コミットで 1 領域を分割し、巨大差分を避ける。
2. まず UI component の純粋な子 component 抽出、次に service / manager の境界抽出を行う。
3. `index.ts` は barrel 専用にする。実装ロジックは置かない。
4. `utils.ts` / `helpers.ts` / `common.ts` は作らず、責務名で命名する。
5. テストのためだけに internal を export しない。

## 進捗

- 2026-05-17: `DebugConsoleManager.ts` から公開型/定数、初期 snapshot 生成、motion snapshot clone、Web Audio meter を分割した。
    - 追加: `src/ts/UI/debugConsolePublicTypes.ts`
    - 追加: `src/ts/UI/debugConsoleSnapshot.ts`
    - 追加: `src/ts/UI/debugConsoleMotionSnapshot.ts`
    - 追加: `src/ts/UI/debugConsoleAudioMeter.ts`
    - `DebugConsoleManager.ts` は 1413 行から 895 行まで縮小したが、RTC / gaze / Sincro motion 更新責務がまだ残るため継続分割対象。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `DebugConsoleManager.ts` から RTC snapshot 更新と Sincro motion retarget runtime 更新を分割した。
    - 追加: `src/ts/UI/debugConsoleRtcSnapshot.ts`
    - 追加: `src/ts/UI/debugConsoleSincroMotionRuntime.ts`
    - `DebugConsoleManager.ts` は 895 行から 699 行まで縮小し、`setSincroPoseRetargetConfig` / `updateSincroPoseRetargetFrame` の巨大な更新処理を純粋 helper へ移した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `DebugConsoleManager.ts` から audio snapshot 更新と gaze pause/tuning 更新を分割した。
    - 追加: `src/ts/UI/debugConsoleAudioSnapshot.ts`
    - 追加: `src/ts/UI/debugConsoleGazeSnapshot.ts`
    - `DebugConsoleManager.ts` は 696 行から 505 行まで縮小し、音声設定 clamp / constraint status 表示文字列 / gaze 停止時の motion snapshot 初期化を純粋 helper へ移した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `DebugConsoleManager.ts` から購読管理と AudioMeter callback 配線を分割した。
    - 追加: `src/ts/UI/debugConsoleEventHub.ts`
    - 追加: `src/ts/UI/debugConsoleAudioMeterFactory.ts`
    - `DebugConsoleManager.ts` は 505 行から 444 行まで縮小し、snapshot/event listener 管理と Web Audio meter 低レベル更新処理を外出しした。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `DebugConsoleManager.ts` から Audio / RTC / Gaze / Sincro motion の操作 facade を分割した。
    - 追加: `src/ts/UI/debugConsoleAudioControls.ts`
    - 追加: `src/ts/UI/debugConsoleRtcControls.ts`
    - 追加: `src/ts/UI/debugConsoleGazeControls.ts`
    - 追加: `src/ts/UI/debugConsoleSincroMotionControls.ts`
    - `DebugConsoleManager.ts` は 444 行から 328 行まで縮小し、import / re-export / コメント / 空行を除く実装行は hard 閾値未満まで下げた。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `SincroPoseRetargeter.ts` から型/既定値、frame clone/smoothing、target gate、腕 retarget、腕 IK solve を分割した。
    - 追加: `src/ts/SincroVRM/VRMCharacter/sincroPoseRetargetTypes.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/sincroPoseRetargetFrame.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/sincroPoseRetargetTargets.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/sincroPoseArmRetargeter.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/sincroPoseArmIkSolve.ts`
    - `SincroPoseRetargeter.ts` は 985 行から 258 行まで縮小し、retargeter 本体は設定・VRM attachment・frame orchestration に寄せた。
    - 新規分割ファイルはいずれも 300 行未満に収めた。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `RTCTalkClient.ts` から RTC 統計表示、ICE failure 診断、DataChannel 作成、PeerConnection event 配線、remote track DOM 配線、/offer negotiation、/candidate 送信、audio sender 操作、shutdown 処理を分割した。
    - 追加: `src/ts/RTC/rtcStatsRecords.ts`
    - 追加: `src/ts/RTC/rtcStatsReporter.ts`
    - 追加: `src/ts/RTC/rtcIceDiagnostics.ts`
    - 追加: `src/ts/RTC/rtcDataChannels.ts`
    - 追加: `src/ts/RTC/rtcPeerConnectionEvents.ts`
    - 追加: `src/ts/RTC/rtcRemoteTrackHandlers.ts`
    - 追加: `src/ts/RTC/rtcIceCandidateSender.ts`
    - 追加: `src/ts/RTC/rtcNegotiation.ts`
    - 追加: `src/ts/RTC/rtcConnectionStateHandler.ts`
    - 追加: `src/ts/RTC/rtcPeerConnectionShutdown.ts`
    - 追加: `src/ts/RTC/rtcPeerConnectionFactory.ts`
    - 追加: `src/ts/RTC/rtcAudioTrackSender.ts`
    - `RTCTalkClient.ts` は 924 行から 293 行まで縮小し、WebRTC session lifecycle の入口に寄せた。
    - 未使用だった `videoCodec` / `audioCodec` fields は参照元がなかったため削除した。
    - endpoint / JSON payload の契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。

## 完了条件

- hard 超過ファイルと hard 超過関数に対し、分割済みまたは分割しない理由が明示されている。
- 新規・変更ファイルがサイズ閾値を大きく超えない。
- 引数 hard 超過の関数が options object 化されている、または理由がある。
- `cd sincromisor-frontend && npm run check:biome` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run check:biome
npm run build
```
