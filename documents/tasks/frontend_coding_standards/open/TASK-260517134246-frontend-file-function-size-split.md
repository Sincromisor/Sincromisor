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
- 2026-05-17: `SincroMotionPanel.tsx` から Face / Pose 表示 section、Pose retarget 調整 UI、表示フォーマット関数を分割した。
    - 追加: `src/react/debug/panels/sincroMotionFaceSection.tsx`
    - 追加: `src/react/debug/panels/sincroMotionPoseSection.tsx`
    - 追加: `src/react/debug/panels/sincroPoseRetargetControls.tsx`
    - 追加: `src/react/debug/panels/sincroMotionPanelFormatters.ts`
    - `SincroMotionPanel.tsx` は 503 行から 39 行まで縮小し、debug tab shell と snapshot 配線だけに寄せた。
    - 既存の debug console snapshot / 操作契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `CharacterBehaviorState.ts` から型/タイミング定数、snapshot clone/初期化、gaze 更新、VAD 更新、状態/モーションポリシー導出、AI 発話更新を分割した。
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterBehaviorTypes.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterBehaviorSnapshots.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterBehaviorGaze.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterBehaviorVad.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterBehaviorAiSpeech.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterBehaviorStateDerivation.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterBehaviorValues.ts`
    - `CharacterBehaviorState.ts` は 678 行から 294 行まで縮小し、TalkManager 購読と入力状態集約の入口に寄せた。
    - 既存の `CharacterBehaviorState.ts` からの型 re-export は維持し、呼び出し側の import 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `UserMediaManager.ts` から WebAudio/VAD/学習VAD runtime、音声制約、track lifecycle、既定設定、型/定数を分割した。
    - 追加: `src/ts/RTC/UserMediaAudioProcessor.ts`
    - 追加: `src/ts/RTC/UserMediaVadRuntime.ts`
    - 追加: `src/ts/RTC/userMediaAudioProfiles.ts`
    - 追加: `src/ts/RTC/userMediaConstraints.ts`
    - 追加: `src/ts/RTC/userMediaDefaultConfig.ts`
    - 追加: `src/ts/RTC/userMediaTrackLifecycle.ts`
    - 追加: `src/ts/RTC/userMediaTypes.ts`
    - 追加: `src/ts/RTC/userMediaVadWorklet.ts`
    - `UserMediaManager.ts` は 774 行から 259 行まで縮小し、MediaStream 取得・track lifecycle・公開 facade に寄せた。
    - 分割後の主要ファイルは `UserMediaAudioProcessor.ts` 239 行、`UserMediaVadRuntime.ts` 276 行に収め、対象領域の hard 超過関数は解消した。
    - 既存の `UserMediaManager.ts` からの型 re-export は維持し、呼び出し側の import 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `SincroPoseTracker.ts` から pose snapshot clone/fallback、landmark geometry、PoseLandmarkerResult 正規化、腕/下半身 target 生成を分割した。
    - 追加: `src/ts/FaceTracking/sincroPoseMotionSnapshotClone.ts`
    - 追加: `src/ts/FaceTracking/sincroPoseLandmarkGeometry.ts`
    - 追加: `src/ts/FaceTracking/sincroPoseTrackerNormalizer.ts`
    - 追加: `src/ts/FaceTracking/sincroPoseTrackerTargets.ts`
    - `SincroPoseTracker.ts` は 521 行から 146 行まで縮小し、MediaPipe lifecycle と推論呼び出しの入口に寄せた。
    - 分割後の新規ファイルはすべて 300 行未満に収め、`normalizeResult` 相当の巨大関数は options object 入力の純粋 helper へ移した。
    - 既存の worker / runtime からの `SincroPoseTracker` import 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `SettingsFields.tsx` と `SettingsSections.tsx` を UI 責務別ファイルへ分割した。
    - 追加: `src/react/settings-fields/settingsHelp.ts`
    - 追加: `src/react/settings-fields/settingsFieldTypes.ts`
    - 追加: `src/react/settings-fields/textSettingsFields.tsx`
    - 追加: `src/react/settings-fields/deviceSettingsFields.tsx`
    - 追加: `src/react/settings-fields/audioProcessingToggles.tsx`
    - 追加: `src/react/settings-fields/characterDisplayToggles.tsx`
    - 追加: `src/react/settings-fields/startupBehaviorFields.tsx`
    - 追加: `src/react/simple-vrm/components/settingsSectionLayout.ts`
    - 追加: `src/react/simple-vrm/components/settingsSectionTypes.ts`
    - 追加: `src/react/simple-vrm/components/settingsCategorySection.tsx`
    - 追加: `src/react/simple-vrm/components/basicSettingsSection.tsx`
    - 追加: `src/react/simple-vrm/components/micSettingsSection.tsx`
    - 追加: `src/react/simple-vrm/components/characterSettingsSection.tsx`
    - 追加: `src/react/simple-vrm/components/lookingGlassSettingsSection.tsx`
    - 追加: `src/react/simple-vrm/components/numericSettingField.tsx`
    - 追加: `src/react/simple-vrm/components/startupSettingsSection.tsx`
    - `SettingsFields.tsx` は 532 行から 14 行、`SettingsSections.tsx` は 596 行から 6 行まで縮小し、既存 import 契約維持用の re-export に寄せた。
    - 分割後の最大ファイルは `lookingGlassSettingsSection.tsx` 188 行で、対象領域の新規ファイルはすべて 200 行 soft 閾値以下に収めた。
    - 設定 UI の表示文言 / endpoint / JSON payload 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `CharacterMotionOrchestrator.ts` から optional bone capture、AI speech expression profile、torso rotation application を分割した。
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterMotionBones.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterMotionExpression.ts`
    - 追加: `src/ts/SincroVRM/VRMCharacter/characterMotionTorsoApplier.ts`
    - `CharacterMotionOrchestrator.ts` は 576 行から 292 行まで縮小し、時系列 blend / beat state と毎フレーム orchestration に寄せた。
    - `updateSpine` / `updateChest` / `updateShoulders` 相当の多引数処理は options object 入力の torso applier へ移した。
    - 呼び出し側の `CharacterMotionOrchestrator` import 契約と endpoint / JSON payload 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `SimpleVrmControlPanel.tsx` から page 生成、Looking Glass 操作ページ、通常設定ページ、接続状態ページを分割した。
    - 追加: `src/react/simple-vrm/simpleVrmControlPanelPages.tsx`
    - 追加: `src/react/simple-vrm/simpleVrmControlPanelTypes.ts`
    - 追加: `src/react/simple-vrm/lookingGlassControlPage.tsx`
    - 追加: `src/react/simple-vrm/simpleVrmSettingsPages.tsx`
    - 追加: `src/react/simple-vrm/simpleVrmConnectionPage.tsx`
    - `SimpleVrmControlPanel.tsx` は 373 行から 38 行まで縮小し、panel state hook と SettingsShell 配線だけに寄せた。
    - 新規分割ファイルは最大 `simpleVrmSettingsPages.tsx` 126 行で、すべて 200 行 soft 閾値以下に収めた。
    - 設定 UI の表示文言 / endpoint / JSON payload 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `AudioPanel.tsx` から Local Mic meter、詳細 audio filter controls、VAD controls、学習 VAD tuning controls を分割した。
    - 追加: `src/react/debug/panels/audioPanelLocalMeter.tsx`
    - 追加: `src/react/debug/panels/audioPanelAdvancedControls.tsx`
    - 追加: `src/react/debug/panels/audioPanelVadControls.tsx`
    - 追加: `src/react/debug/panels/audioPanelLearnedVadTuning.tsx`
    - `AudioPanel.tsx` は debug tab shell と remote meter / controls 配線に寄せた。
    - select 値の union 変換を parse helper に寄せ、`as` 型アサーションを使わない形にした。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `ConfigurationDialogSettingsPanel.tsx` から VRM file picker、drag/drop handlers、footer、settings page 生成を分割した。
    - 追加: `src/react/dialog/configurationDialogVrmFilePicker.ts`
    - 追加: `src/react/dialog/configurationDialogVrmDragDrop.ts`
    - 追加: `src/react/dialog/configurationDialogSettingsFooter.tsx`
    - 追加: `src/react/dialog/configurationDialogSettingsPages.tsx`
    - 追加: `src/react/dialog/configurationDialogConnectionPage.tsx`
    - `ConfigurationDialogSettingsPanel.tsx` は dialog state と `SettingsShell` 配線だけに寄せた。
    - 初回セットアップ UI の表示文言 / endpoint / JSON payload 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `GazePanel.tsx` から camera preview、status table、gaze tuning controls を分割した。
    - 追加: `src/react/debug/panels/gazePreview.tsx`
    - 追加: `src/react/debug/panels/gazeStatusTable.tsx`
    - 追加: `src/react/debug/panels/gazeTuningControls.tsx`
    - `GazePanel.tsx` は debug tab shell と gaze section 配線だけに寄せた。
    - tuning preset keys は型付き配列にし、`as` 型アサーションを使わない形にした。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `useSimpleVrmPanelState.ts` から AppController event state、event handler 生成、初期表示値を分割した。
    - 追加: `src/react/simple-vrm/useSimpleVrmPanelEventState.ts`
    - 追加: `src/react/simple-vrm/simpleVrmPanelEventHandlers.ts`
    - 追加: `src/react/simple-vrm/simpleVrmPanelDefaults.ts`
    - `useSimpleVrmPanelState.ts` は 359 行から 99 行まで縮小し、media device state と control action facade に寄せた。
    - 分割後の新規ファイルはすべて 300 行未満に収め、対象領域の hard 超過関数は作らない形にした。
    - 表示 UI / endpoint / JSON payload 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: `DialogManager.ts` から VRM 状態更新、media device 派生 UI、settingsChange batching、dialog UI state 通知を分割した。
    - 追加: `src/ts/UI/dialogVrmStateController.ts`
    - 追加: `src/ts/UI/dialogMediaDeviceUiController.ts`
    - 追加: `src/ts/UI/dialogSettingsChangeBatcher.ts`
    - 追加: `src/ts/UI/dialogUiStateController.ts`
    - 追加: `src/ts/UI/dialogBooleanSettings.ts`
    - `DialogManager.ts` は 558 行から 399 行まで縮小し、import / re-export / コメント / 空行を除く実装行は 294 行まで下げた。
    - dialog public API、設定 UI の表示文言、endpoint / JSON payload 契約は変更していない。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-18: React UI / dialog hook の残存 hard 超過関数を責務別 private component / hook へ分割した。
    - 対象: `src/react/debug/panels/sincroPoseRetargetControls.tsx`
    - 対象: `src/react/simple-vrm/components/lookingGlassSettingsSection.tsx`
    - 対象: `src/react/settings-fields/characterDisplayToggles.tsx`
    - 対象: `src/react/dialog/useConfigurationDialogSettingsState.ts`
    - Pose retarget 調整 UI は IK mode / 基本調整 / 腕 IK 調整へ分割した。
    - Looking Glass 設定 UI は header / preset / display numeric fields / target numeric fields へ分割した。
    - Character display 設定 UI は toggle grid / motion ranges / hints へ分割した。
    - Configuration dialog hook は controller state / settings snapshots / dialog UI snapshots / subscription / actions へ分割した。
    - 対象 4 ファイル内の 60 行超関数と 4 引数超関数は解消した。
    - 設定 UI の表示文言 / endpoint / JSON payload 契約は変更していない。
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
