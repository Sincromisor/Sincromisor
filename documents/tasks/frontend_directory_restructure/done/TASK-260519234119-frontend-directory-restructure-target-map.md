# TASK-260519234119 frontend directory restructure target map

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: High
- 種別: Task

## 目的

フロントエンドの責務別ディレクトリ再編について、移動先、依存方向、実施順を先に固定し、後続タスクが場当たり的な rename にならないようにする。

## 背景

現状は `src/ts` / `src/react` の技術別配置と、`src/ts/rtc` / `src/ts/ui` などの広い責務名が混在している。特に RTC、UserMedia、VAD、会話状態、Debug Console、settings UI が物理的に近すぎるため、変更影響が読みづらい。

## スコープ

- 現在 path と移動先 path の対応表作成
- feature / app / character / shared / pages の責務定義
- 許可する依存方向と禁止する依存方向の整理
- タスク実施順と分割単位の確認

## 非対象

- 実ファイルの移動
- import path の変更
- runtime 挙動変更

## 完了条件

- 移動前後対応表が文書化されている
- 後続タスクの実施順が明確になっている
- `features/rtc` から React UI へ直接依存しない等の境界ルールが明記されている
- 設計文書更新が必要な対象が列挙されている

## 確認

- 後続タスクが 1 タスク 1 コミット相当の粒度になっていることを確認する
- URL ルート変更の有無と再デプロイ影響を確認する

## 責務ディレクトリ方針

### Top-level

| 新 path | 責務 | 備考 |
| --- | --- | --- |
| `src/pages/` | Vite MPA の page entry とページ固有 runtime | URL 互換の都合で build output と dev route を各ページタスクで確認する |
| `src/app/` | React app shell と runtime orchestration の公開入口 | UI から core へ触る正規 facade を集約する |
| `src/features/` | 会話、RTC、media、dialog、settings、debug などの機能単位 | feature 間の横断 import は原則禁止し、必要な値は app/controller 経由に寄せる |
| `src/character/` | VRM scene、behavior、tracking、retargeting、IK | Three.js / VRM / MediaPipe 依存をこの境界へ寄せる |
| `src/shared/` | logging、DOM 小物、純粋な UI primitive など | domain を持つものは shared に置かない |
| `src/types/` | ambient declaration | 既存 `lookingGlassWebxr.d.ts` は維持または `shared/types` 化を後続で判断する |

### 依存方向

| From | Allowed To | 禁止する方向 |
| --- | --- | --- |
| `pages/*` | `app/*`, `character/pageRuntimes/*`, page-local files | `features/*` 内部実装への直接依存 |
| `app/shell` | `app/controller` の公開型/API, `features/*/ui`, `shared/*` | RTC / MediaPipe / VRM scene の生制御 |
| `app/controller` | `features/*/runtime`, `character/*`, `shared/*` | React component への依存 |
| `features/rtc` | `features/media`, `features/conversation`, `shared/logging` | React UI、dialog、debug UI への依存 |
| `features/debug` | controller snapshot / feature public type | RTC client / tracker worker の内部 class 直参照 |
| `features/dialog` | controller facade / settings model / UI primitives | page runtime、RTC core 内部 |
| `character/*` | `features/media` の公開 type、`shared/logging` | React UI、dialog、settings UI |
| `shared/*` | 外部ライブラリ、標準 API | `app/*`, `features/*`, `character/*`, `pages/*` |

## 移動前後対応表

### Pages

| 現 path | 移動先 path | 対応タスク |
| --- | --- | --- |
| `src/index.html` | `src/pages/main/index.html` | TASK-260519234120 |
| `src/simple-vrm/index.html` | `src/pages/simpleVrm/index.html` | TASK-260519234120 |
| `src/simple-vrm/mainReact.tsx` | `src/pages/simpleVrm/mainReact.tsx` | TASK-260519234120 |
| `src/vrm360/index.html` | `src/pages/vrm360/index.html` | TASK-260519234120 |
| `src/vrm360/mainReact.tsx` | `src/pages/vrm360/mainReact.tsx` | TASK-260519234120 |
| `src/vrm360/mainVrm360.ts` | `src/pages/vrm360/mainVrm360.ts` または `src/character/pageRuntimes/vrm360Runtime.ts` | TASK-260519234120 / TASK-260519234140 |
| `src/looking-glass-vrm/index.html` | `src/pages/lookingGlassVrm/index.html` | TASK-260519234120 |
| `src/looking-glass-vrm/mainReact.tsx` | `src/pages/lookingGlassVrm/mainReact.tsx` | TASK-260519234120 |
| `src/looking-glass-vrm/mainVrmLookingGlass.ts` | `src/pages/lookingGlassVrm/mainVrmLookingGlass.ts` または `src/character/pageRuntimes/lookingGlassVrmRuntime.ts` | TASK-260519234120 / TASK-260519234140 |
| `src/motion-debug/**` | `src/pages/motionDebug/**` | TASK-260519234120 |
| `src/pose-landmarker-spike/**` | `src/pages/poseLandmarkerSpike/**` | TASK-260519234120 |

URL は当面 `/simple-vrm/`、`/vrm360/`、`/looking-glass-vrm/`、`/motion-debug/`、`/pose-landmarker-spike/` を維持する。`src/pages/*` の camelCase directory は source ownership を示す名前であり、dev/build の公開 path は Vite input または redirect shim で後続タスクが確認する。

### App

| 現 path | 移動先 path | 対応タスク |
| --- | --- | --- |
| `src/react/appShell/**` | `src/app/shell/**` | TASK-260519234121 |
| `src/react/app/appSettingsTypes.ts` | `src/app/controller/appSettingsTypes.ts` | TASK-260519234122 |
| `src/react/app/subscribeActiveSincroAppController.ts` | `src/app/controller/subscribeActiveSincroAppController.ts` | TASK-260519234122 |
| `src/react/app/subscribeActiveSincroAppEvents.ts` | `src/app/events/subscribeActiveSincroAppEvents.ts` | TASK-260519234123 |
| `src/react/app/sincroAppStateSnapshotHydrators.ts` | `src/app/controller/sincroAppStateSnapshotHydrators.ts` | TASK-260519234125 |
| `src/react/app/useRightToolPanelState.ts` | `src/app/shell/useRightToolPanelState.ts` | TASK-260519234121 |
| `src/react/app/useSincroMediaDeviceState.ts` | `src/app/shell/useSincroMediaDeviceState.ts` | TASK-260519234121 |
| `src/react/app/panelLogHelpers.ts` | `src/features/debug/ui/panelLogHelpers.ts` | TASK-260519234133 |
| `src/react/app/uiTuning.ts` | `src/shared/ui/uiTuning.ts` | TASK-260519234141 |
| `src/ts/app/sincroAppController.ts` | `src/app/controller/sincroAppController.ts` | TASK-260519234122 |
| `src/ts/app/sincroAppTypes.ts` | `src/app/controller/sincroAppTypes.ts` | TASK-260519234122 |
| `src/ts/app/sincroAppActiveControllerRegistry.ts` | `src/app/controller/sincroAppActiveControllerRegistry.ts` | TASK-260519234122 |
| `src/ts/sincroController.ts` | `src/app/controller/sincroController.ts` | TASK-260519234122 |
| `src/ts/app/*Event*`, `src/ts/app/*Subscription*` | `src/app/events/**` | TASK-260519234123 |
| `src/ts/app/*Bridge*`, `src/ts/app/*DialogFacade*` | `src/app/bridges/**` | TASK-260519234124 |
| `src/ts/app/*Settings*Snapshot*`, `src/ts/app/*UiStateSnapshot*` | `src/app/snapshots/**` | TASK-260519234125 |

### Features

| 現 path | 移動先 path | 対応タスク |
| --- | --- | --- |
| `src/ts/rtc/rtcTalkClient.ts` と接続 core | `src/features/rtc/core/**` | TASK-260519234126 |
| `src/ts/rtc/rtcBoundarySchema.ts`, `rtcMessage.ts` | `src/features/rtc/contracts/**` | TASK-260519234126 |
| `src/ts/rtc/rtcStats*`, `rtcIceDiagnostics.ts` | `src/features/rtc/diagnostics/**` | TASK-260519234127 |
| `src/ts/rtc/userMedia*`, `videoInputManager.ts` | `src/features/media/userMedia/**` | TASK-260519234128 |
| `src/ts/rtc/sileroVad*`, `learnedVadWorkerClient.ts` | `src/features/media/vad/**` | TASK-260519234129 |
| `src/ts/rtc/talkManager*`, `talkTelopSegmentBuffer.ts`, `talkLegacyTelopRenderer.ts` | `src/features/conversation/talk/**` | TASK-260519234130 |
| `src/ts/ui/chatMessageService.ts`, `src/react/chat/**` | `src/features/conversation/chat/**` | TASK-260519234131 |
| `src/react/telop/**` | `src/features/conversation/telop/**` | TASK-260519234131 |
| `src/ts/ui/dialog*`, `src/react/dialog/**` | `src/features/dialog/**` | TASK-260519234132 |
| `src/ts/ui/debugConsole*`, `src/react/debug/**` | `src/features/debug/**` | TASK-260519234133 |
| `src/react/settingsFields/**`, `settingsPrimitives/**`, `settingsShell/**`, `simpleVrm/**`, `integratedTabs/**`, `overlay/**` | `src/features/settings/**` または `src/app/shell/**` | TASK-260519234134 |

### Character

| 現 path | 移動先 path | 対応タスク |
| --- | --- | --- |
| `src/ts/characterGaze/**` | `src/character/gaze/**` | TASK-260519234135 |
| `src/ts/faceTracking/**` | `src/character/tracking/**` | TASK-260519234135 |
| `src/ts/sincroVrm/vrmScene/**` | `src/character/scene/vrmScene/**` | TASK-260519234136 |
| `src/ts/sincroVrm/vrmCharacter/characterBehavior*`, `eye*`, `face*`, `*SpeechGesture*` | `src/character/behavior/**` | TASK-260519234137 |
| `src/ts/sincroVrm/vrmCharacter/sincroFaceRetarget*`, `sincroPoseRetarget*`, `characterMotion*` | `src/character/retargeting/**` | TASK-260519234138 |
| `src/ts/sincroVrm/vrmCharacter/sincro*Ik*`, `armBone*`, `headBone*`, `legBone*`, `rotationFilter.ts` | `src/character/ik/**` | TASK-260519234139 |
| `src/ts/sincroVrm/sincro*Initializer.ts`, `lookingGlass/**`, `vrm360/**`, `mainVrm.ts` | `src/character/pageRuntimes/**` | TASK-260519234140 |

### Shared

| 現 path | 移動先 path | 対応タスク |
| --- | --- | --- |
| `src/ts/logging/appLogger.ts` | `src/shared/logging/appLogger.ts` | TASK-260519234141 |
| `src/ts/mediaDevices/sincroMediaDeviceService.ts` | `src/features/media/devices/sincroMediaDeviceService.ts` | TASK-260519234128 |
| `src/styles/**` | `src/shared/styles/**` または feature-local CSS | TASK-260519234141 |
| `src/types/lookingGlassWebxr.d.ts` | `src/types/lookingGlassWebxr.d.ts` 維持 | TASK-260519234141 |

## 実施順

1. TASK-260519234120: pages を移動し、URL 維持方針を確定する。
2. TASK-260519234121 から TASK-260519234125: app shell / controller / events / bridges / snapshots を先に整える。
3. TASK-260519234126 から TASK-260519234131: RTC / media / VAD / conversation を feature 化する。
4. TASK-260519234132 から TASK-260519234134: dialog / debug / settings UI を feature 化する。
5. TASK-260519234135 から TASK-260519234140: character runtime を gaze/tracking/scene/behavior/retargeting/IK/pageRuntimes に分ける。
6. TASK-260519234141: logging / styles / shared primitives を整理する。
7. TASK-260519234142: import 境界違反と旧 path 参照を消す。
8. TASK-260519234143: design docs を現在構造へ同期する。
9. TASK-260519234144: build / check / 必要な smoke test をまとめて実施する。

## 設計文書同期対象

- `documents/design/frontend/pages.md`
    - `src/pages/*` の source ownership と URL 維持方針を反映する。
- `documents/design/frontend/app-shell.md`
    - `src/app/shell` / `src/app/controller` / feature UI の境界を反映する。
- `documents/design/frontend/settings-and-debug-ui.md`
    - dialog / settings / debug feature colocation 後に参照 path を更新する。
- `documents/design/frontend/audio/vad.md`
    - VAD が `features/media/vad` へ移動した後に参照 path を更新する。
- `documents/design/frontend/character/overview.md`
    - `src/character/*` 構成へ更新する。
- `documents/design/frontend/character/motion.md`
    - behavior / retargeting / IK の移動後に参照 path を更新する。
- `documents/design/frontend/character/tracking.md`
    - gaze / tracking の分割後に参照 path を更新する。
