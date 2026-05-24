# Frontend App Shell

## Summary

- フロントエンドは Vite MPA を維持し、modern ページは単一 React app shell へ集約している。
- `simple-vrm`、`vrm360`、`looking-glass-vrm` は `div#sincroPageRoot` 配下で dialog / header / chat / telop / settings / debug を描画する。
- WebRTC、UserMedia、CharacterGaze、VRM scene の起動は `SincroAppController` と下位 controller が束ねる。
- 物理構成は `app` / `features` / `character` / `shared` / `pages` を上位境界とし、旧 `src/ts` / `src/react` には新規実装を置かない。
- RTC 契約の正本は `contracts/frontend-rtc.md` に置く。

## Scope

- 対象:
    - modern frontend の app shell
    - React UI と TypeScript core の責務境界
    - 起動前 dialog、右側 tool panel、Debug Console の所有境界
- 非対象:
    - VRM bone / expression 制御
    - WebRTC endpoint / payload の詳細
    - 完了済み React 移行の作業ログ

## Responsibilities

- `src/app/shell/sincroPageAppShell.tsx`
    - modern 3D ページの React root。
    - dialog、header、chat、telop、right tool panel、settings、debug をまとめて描画する。
- `src/app/shell/bootstrapSincroPageAppShell.tsx`
    - page entry から React root を mount し、ページ別 control panel を app shell へ渡す。
- `SincroAppController`
    - UI と core の facade。
    - 起動設定、RTC、media device、debug snapshot、right tool panel state を束ねる。
- `SincroController`
    - UserMedia 取得、RTC 開始、CharacterGaze 開始、TalkManager 連携の runtime 制御を担う。
- `RTCTalkClient`
    - PeerConnection、Offer/Answer、ICE candidate、DataChannel event を扱う。
- React settings / debug components
    - 表示と操作に専念し、WebRTC や MediaPipe の生制御を直接持たない。

## Physical Structure

- `src/app/controller`
    - `SincroAppController` / `SincroController` と、RTC・audio・gaze を束ねる app-level controller を置く。
- `src/app/events`
    - AppController の event hub、snapshot emission、active subscription wiring、window event binder を置く。
- `src/app/bridges`
    - AppController と legacy manager / service singleton の接続点、bridge 型、runtime bundle factory を置く。
- `src/app/settings`
    - settings defaults / snapshot / apply / startup status / related payload cache を置く。
    - `sincroAppSettingsDefaults.ts` は AppController snapshot、React fallback、DialogStateStore、Looking Glass runtime の既定値の正本を持つ。
- `src/app/react`
    - active AppController subscription hook、panel state helper、UI tuning など app shell から使う React helper を置く。
- `src/features`
    - RTC、media、conversation、dialog、debug、settings、gaze などユーザー機能単位の model / React / runtime を置く。
- `src/character`
    - VRM scene、behavior、retargeting、IK、page-specific VRM runtime を置く。
- `src/shared`
    - logging と横断型など、feature 固有ではない基盤を置く。
- `src/pages`
    - Vite MPA の HTML / entry / page-specific React panel / developer page runtime を置く。

## Data / State

- 起動設定:
    - audio input device
    - gaze camera device
    - VRM URL
    - talk mode
    - character motion / gaze / pose options
- Runtime state:
    - RTC connection state
    - media device snapshot
    - VAD / audio meter
    - text / telop messages
    - gaze / tracking diagnostics
- UI state:
    - startup dialog open state
    - active right tool panel
    - settings category
    - debug tab

## Interfaces

- 外部契約:
    - `documents/design/contracts/frontend-rtc.md`
- 内部イベント:
    - React UI は app controller の snapshot / subscription API を使う。
    - manager singleton への直接依存は段階的に縮退させる。

## Config / Deployment

- 通常確認:
    - `cd sincromisor-frontend && npm run build`
- dev server:
    - `cd sincromisor-frontend && npm run dev`
- Vite build input:
    - `main`
    - `simple-vrm`
    - `vrm360`
    - `looking-glass-vrm`

## Observability / Failure Modes

- Debug Console は `Status` / `Audio` / `Messages` / `Gaze` / `RTC` / `SDP` のタブ型診断を提供する。
- backend 未起動時は `config.json` 取得が失敗する。
- ブラウザ権限未付与時は `getUserMedia` が失敗する。
- `OrbitControls` の入力対象は character control layer に限定し、header / chat / telop / right tool と競合させない。

## Change Checklist

- UI shell を変更したら `frontend/pages.md` と `frontend/settings-and-debug-ui.md` の影響を確認する。
- RTC 接続仕様を変更したら `contracts/frontend-rtc.md` と backend を同時確認する。
- media device 設定を変更したら startup dialog と settings panel の両方を確認する。
- settings 既定値を変更したら startup dialog、settings panel、Looking Glass runtime snapshot の初期値一致を確認する。
- modern page の layout を変えたら desktop / mobile の表示確認を行う。

## References

- `documents/design/frontend/pages.md`
- `documents/design/frontend/settings-and-debug-ui.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
