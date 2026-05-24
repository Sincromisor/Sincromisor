# Settings And Debug UI

## Summary

- 設定 UI は一般ユーザー向け、Debug Console は開発者向け診断として役割を分ける。
- 起動前 dialog と開始後 settings panel は同じ分類軸を使い、実行時に変更できるものと再開始が必要なものを明確にする。
- 右側 tool panel は settings と Debug Console を相互排他で表示し、外側 chrome は `RightToolFrame` が所有する。

## Scope

- 対象:
    - 起動前設定 dialog
    - 開始後 settings panel
    - right tool menu / frame
    - Debug Console
- 非対象:
    - RTC payload
    - VRM motion algorithm
    - Playwright 確認ログの詳細

## Responsibilities

- `src/features/settings/react`
    - settings field、primitive、shell を置く。
    - `fields` は設定項目入力、`primitives` は表示部品、`shell` はカテゴリ構造を担当する。
- `src/app/settings/sincroAppSettingsDefaults.ts`
    - startup dialog と settings panel が共有する settings snapshot / UI fallback の既定値を持つ。
    - DialogStateStore と Looking Glass runtime config も同じ既定値を参照する。
- `src/features/dialog`
    - 起動前 dialog の model / service / React component を置く。
    - settings field 自体は `features/settings` を参照し、dialog 固有の状態・通知・VRM workflow だけを所有する。
- `src/features/debug`
    - Debug Console の model / controls / React panels を置く。
    - RTC / media / character runtime から React debug UI へ直接依存しない。
- `src/app/shell/react/overlay`
    - dialog / right tool の外枠 chrome を置く。
- `SettingsShell`
    - 設定カテゴリと本文の情報設計を持つ。
    - overlay frame や fixed position は持たない。
- `RightToolFrame`
    - 右側 tool 領域の位置、幅、z-index、scroll、close button、外側クリック閉じを持つ。
- `StartupDialogFrame`
    - 起動前 dialog の surface、backdrop、padding、scroll を持つ。
- `DebugConsole`
    - diagnostics snapshot を表示する。
    - WebRTC / MediaPipe / Audio の生制御を直接所有しない。

## Information Architecture

- 一般設定カテゴリ:
    - `会話`
    - `入出力デバイス`
    - `音声`
    - `表示`
    - `接続`
    - 必要な場合のみ `詳細設定`
- Debug Console tabs:
    - `Status`
    - `Audio`
    - `Messages`
    - `Gaze`
    - `RTC`
    - `SDP`

## Interaction Rules

- settings panel と Debug Console は同時に大きく重ねない。
- close button、panel padding、scroll、responsive width は frame 側へ寄せる。
- 現在ページで有効な項目がないカテゴリは通常表示しない。
- `Ctrl+Alt+D` は Debug Console の導線として扱う。
- 技術用語が必要な診断情報は Debug Console に置き、通常設定には混ぜない。
- `forceSincroPoseTracking` は低性能端末での姿勢同期デバッグ用設定として扱い、通常利用では `pose_inference_too_slow` の自動降格を優先する。

## Change Checklist

- 設定項目を追加したら startup dialog と settings panel の両方の扱いを決める。
- 既定値を追加・変更したら `sincroAppSettingsDefaults.ts` を正本として更新し、DialogStateStore / runtime snapshot に重複値を増やさない。
- 実行時変更可能か、再開始が必要かを文言に反映する。
- Debug Console に診断項目を追加する場合は、どの snapshot provider が責務を持つか確認する。
- overlay 外枠の変更は `src/app/shell/react/overlay/*` と `overlay.css` を優先する。

## References

- `documents/design/frontend/app-shell.md`
- `documents/design/decisions/ADR-260430-overlay-frame.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
