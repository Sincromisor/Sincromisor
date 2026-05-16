# React Migration Initiative

## Summary

- React 移行は UI shell から始め、RTC / Media / VRM core は TypeScript 実装を再利用する。
- Babylon.js legacy は通常導線から外れ、modern pages は React app shell に集約済みである。
- この文書は残りの移行・整理観点だけを扱い、完了済みの詳細ログは archive と task done を参照する。

## Goal

- modern frontend の UI owner を React app shell に寄せ、DOM manager / singleton 依存を必要最小限にする。
- page entry、initializer、controller、React UI の責務境界を読みやすく保つ。

## Scope

- 対象:
    - React app shell
    - Settings / Debug Console
    - App controller boundary
    - legacy DOM dependency reduction
- 非対象:
    - RTC protocol 変更
    - VRM motion algorithm
    - backend 再設計

## Current State

- modern 3D ページは `div#sincroPageRoot` 配下の React app shell に集約済み。
- `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm` が通常 build input。
- Babylon.js legacy は通常導線から削除済み。
- Debug Console と settings panel は right tool frame 配下で相互排他表示する。

## Target State

- React UI は app controller の snapshot / subscription API を通して runtime state を読む。
- DOM id は platform boundary や互換が必要な箇所に限定する。
- 設定と診断は情報設計・表示・外枠責務が分離されている。

## Remaining Work

| 領域        | 内容                                             | 完了条件                            |
| ----------- | ------------------------------------------------ | ----------------------------------- |
| UI boundary | React UI から manager singleton 直接依存を減らす | app controller 経由に統一されている |
| Debug       | diagnostics core と UI 表示の境界を保つ          | snapshot provider が明確            |
| Docs        | 旧移行ログを archive へ寄せる                    | current design が短く読める         |

## Verification

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` desktop / mobile の startup dialog、settings、Debug Console を確認する。
- `vrm360` / `looking-glass-vrm` の shared shell が起動前 UI で崩れないことを確認する。

## References

- `documents/design/frontend/app-shell.md`
- `documents/design/frontend/settings-and-debug-ui.md`
- `documents/design/decisions/ADR-260222-react-migration.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
