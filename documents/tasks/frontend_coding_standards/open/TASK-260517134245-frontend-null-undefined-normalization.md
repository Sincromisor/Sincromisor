# TASK-260517134245 frontend null undefined normalization

- 作成日: 2026-05-17
- ステータス: Open
- 優先度: Medium
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

アプリ内部の欠損表現を `undefined` に寄せ、`null` と `undefined` の混在を減らす。

## 背景

規約ではアプリ内の欠損を `undefined` に統一し、外部 I/O 境界でのみ `null` を許容すると定めている。2026-05-17 時点で `null` は 1046 箇所 / 91 ファイルに存在する。

ただし React の「何も描画しない」ための `return null` や `JSON.stringify(value, null, 2)` など、機械的に置換すべきでない箇所も多い。対象を state / model / service の欠損表現に絞って進める。

## スコープ

- app state / snapshot / service model の `T | null` を `T | undefined` へ整理
- device selection の未選択状態を `undefined` へ統一
- motion / gaze / RTC diagnostic snapshot の欠損表現を整理
- `value || defaultValue` のうち既定値用途を `value ?? defaultValue` へ置換
- 外部 API や DOM API が返す `null` は境界で変換する

## 非対象

- React component の `return null`
- `JSON.stringify(value, null, 2)` の `null`
- DOM API の戻り値型そのものの変更
- サーバー contract の変更
- 表示文言や UI 情報設計の変更

## 対象例

- `sincromisor-frontend/src/react/app/**`
- `sincromisor-frontend/src/react/simple-vrm/**`
- `sincromisor-frontend/src/react/dialog/**`
- `sincromisor-frontend/src/ts/App/**`
- `sincromisor-frontend/src/ts/UI/DialogManager.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/ts/MediaDevices/SincroMediaDeviceService.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`

## 実装方針

1. まず state snapshot / type 定義を小さな境界ごとに整理する。
2. UI component の props は `undefined` 既定へ寄せ、必要な場合だけ React の `null` を返す。
3. `== null` は `value === undefined` または境界 helper へ置換する。
4. `||` は論理条件と既定値用途を分け、`0` / `""` / `false` を壊さない。

## 進捗

- 2026-05-17: device selection の未選択状態を `undefined` へ統一した。
    - 対象: `SincroMediaDeviceService` / `DialogStateStore` / `DialogManager` / `SincroAppSettingsSnapshot` / React settings hooks / `UserMediaManager` / `VideoInputManager`
    - `Partial<SincroAppSettingsSnapshot>` で `undefined` を渡して既定デバイスへ戻す操作が落ちないよう、device id の apply は key presence 判定へ変更した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: AppController 周辺の内部欠損表現を `undefined` へ追加整理した。
    - 対象: `SincroAppActiveControllerRegistry` / `SincroAppController` / `SincroAppStartupSettings` / `SincroAppRightToolPanelService` / `SincroAppEventMappers` / `SincroAudioInputController` / `SincroCharacterGazeController`
    - `Partial<SincroAppSettingsSnapshot>` の device id 以外の apply 判定を `!== undefined` に統一し、`map*ToAppEvent` の「イベントなし」も `undefined` に統一した。
    - `CharacterBehaviorState.setErrorSource(..., null)` と `loadVrmThumbnailBlob(): Promise<Blob | null>` は clear API / ブラウザ境界由来の契約として残した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
    - 追加確認: `npm run check` は `documents/rules/coding-py.md` の既存 Markdown 整形差分で失敗。
- 2026-05-17: active controller registry の未登録状態を `undefined` へ統一した。
    - 対象: `SincroAppActiveControllerRegistry` / `SincroAppController.getCurrent` / React active controller subscription hooks
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: 学習VADと simple-vrm 診断パネルの未観測値を `undefined` へ統一した。
    - 対象: `LearnedVadWorkerClient` / `LearnedVadUiReport` / `SincroAppEvent.learned_vad_state` / `PanelGazeState` / `PanelLearnedVadState`
    - `probability` / gaze 値は optional にし、初期 state から `null` を除去した。
    - tuning patch の optional 判定を `!= null` から `!== undefined` へ変更した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: CharacterBehavior snapshot と一部 RTC/Talk 内部状態の未観測値を `undefined` へ統一した。
    - 対象: `CharacterBehaviorState` / `SincroRtcSessionController` / `SincroRTCConfigManager` / `TalkManager` / AI speech gesture controller 群
    - `CharacterBehavior*Snapshot` の時刻・AI発話・エラー未設定値を optional にし、`setErrorSource(..., null)` は `clearErrorSource(...)` へ置き換えた。
    - RTC 設定未取得と current mora 未保持の内部状態を `undefined` に統一した。
    - `SincroFaceMotionSnapshot` / `SincroPoseMotionSnapshot` の `fallbackReason: null` は tracker snapshot 契約側の残件として維持した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: Dialog UI state と simple-vrm 診断表示の未設定値を `undefined` / `??` へ追加整理した。
    - 対象: `DialogStateStore` / `DialogManager` / `ConfigurationDialog` / `useConfigurationDialogSettingsState` / `SimpleVrmControlPanel` / `DiagnosticsStatusCards` / `SettingsStatusCard`
    - `startButtonHint` を optional にし、未設定時に `null` を流さない形へ変更した。
    - Looking Glass 診断表示と RTC state 表示の既定値用途を `||` から `??` へ置換した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: Sincro motion snapshot と一部診断値の未設定表現を `undefined` へ追加整理した。
    - 対象: `SincroFaceMotionSnapshot` / `SincroPoseMotionSnapshot` / `SincroFaceTracker` / `SincroPoseTracker` / `SincroTrackerWorkerClient` / `TrackerRuntime` / `sincro-tracker.worker` / `SincroMotionPanel`
    - face / pose motion snapshot の `lastUpdatedAtMs` / `fallbackReason` / matrix / pose target の未観測座標を optional にし、tracker worker の pose 未返却と fallback reason も `undefined` へ寄せた。
    - `DialogManager` / `ConfigurationDialogSettingsPanel` / `TalkManager` / `UserMediaManager` / `silero-vad.worker` / VRM canvas sizing / motion debug の既定値用途を `??` または明示 helper へ置き換えた。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: VRMCharacter controller と RTC trend 診断の内部欠損表現を `undefined` へ追加整理した。
    - 対象: `CharacterMotionOrchestrator` / `ArmBoneController` / `EyeBehaviorController` / `FaceEmotionController` / `FaceMorphController` / `HeadBoneController` / `DebugConsoleManager` / `debugConsoleRtcControls` / `debugConsoleRtcSnapshot` / `RTCTalkClient`
    - idle / blink / speech gesture / emotion / mouth animation の内部タイマー・アクティブ状態を optional にし、three-vrm / WebRTC API 境界で受けた `null` は helper 内で `undefined` に寄せた。
    - RTC trend point の「未観測値」を `undefined` に統一し、bitrate 計算キャッシュも optional に変更した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: FaceTracking runtime と VRM retargeter 周辺の内部欠損表現を `undefined` へ追加整理した。
    - 対象: `SincroFaceTracker` / `SincroPoseTracker` / `SincroTrackerWorkerClient` / `TrackerRuntime` / `sincro-tracker.worker` / `SincroFaceRetargeter` / `SincroPoseRetargeter` / `SincroArmIkSolver` / `sincroArmIkConstraint` / debug console snapshot helper
    - MediaPipe tracker の model / init promise / worker pending state、face neutral calibration、pose retarget の fallback reason / solver probe / IK quaternion を optional にし、DOM の `srcObject = null` など境界由来の `null` だけを残した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: CharacterGaze spike と motion-debug の内部欠損表現を `undefined` へ追加整理した。
    - 対象: `PoseLandmarkerSpike` / `OneEuroFilter` / `pose-landmarker-spike/main.ts` / `motion-debug/**`
    - spike metrics の未観測値、OneEuroFilter の前回値、motion-debug の capture / active stream 状態を optional にし、`JSON.stringify(value, null, 2)` と `srcObject = null` は境界・formatter として残した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: CharacterGaze selector / VRM thumbnail cache / 一部 meter handle の内部欠損表現を `undefined` へ追加整理した。
    - 対象: `CharacterGaze` / `FaceTargetSelector` / `VideoInputManager` / `DialogVrmFileService` / `DialogVrmWorkflowService` / `SincroVRMInitializer` / `VRMScene` / `VRMCharacterManager` / `DebugConsoleAudioMeter` / `LearnedVadWorkerClient`
    - 顔ターゲット未選択、animation frame id、callback、カメラ track、VRM cache miss、生成済み system icon URL、active scene、audio meter / learned VAD worker handle を optional にした。
    - `querySelector` / `srcObject = null` / `canvas.toBlob` など DOM・Canvas 境界由来の `null` は維持した。
    - 確認: `npm run check:biome` / `npm run build` 成功。
- 2026-05-17: RTC セッション・音声処理・VRMCharacter 周辺の内部欠損表現を `undefined` へ追加整理した。
    - 対象: `RTCTalkClient` / `SincroRtcSessionController` / `UserMediaManager` / `LearnedVadWorkerClient` / `silero-vad.worker` / `VRMCharacterManager` / `sincroCcdIkProbe` / `LegBoneController` / `FaceEmotionController`
    - RTC の session id / timer id / health clear 通知、AudioContext / AudioWorklet node / raw track、Silero worker の session / pending frame / 推論未返却値を optional にした。
    - VRM load 後 controller / root bone / behavior snapshot、CCDIK probe の探索失敗、脚 controller の bone lookup を `undefined` に寄せた。
    - `RTCIceCandidateInit | null` / `event.candidate === null` / `RTCSessionDescription | null` / ONNX metadata の `null` は WebRTC・ブラウザ・外部ライブラリ境界として維持した。
    - 確認: `npm run check:biome` / `npm run build` 成功。

## 完了条件

- アプリ内部 model / state の新規欠損表現が `undefined` に統一されている。
- `null` を残す箇所が React render / DOM boundary / JSON formatter / 外部 contract などに限定されている。
- `value || defaultValue` の既定値用途が `??` に置き換わっている。
- `cd sincromisor-frontend && npm run check:biome` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認コマンド案

```sh
rg "\\bnull\\b|\\|\\|" sincromisor-frontend/src
cd sincromisor-frontend
npm run check:biome
npm run build
```
