# ADR-260430 Overlay Frame Ownership

## Status

- Accepted

## Context

起動前 dialog、右側 settings panel、Debug Console の surface、close button、scroll、z-index、responsive width が各 component / CSS に分散し、見た目の小修正が別 overlay へ波及しやすかった。

## Decision

- overlay の外側 chrome は専用 frame component と shared CSS token が所有する。
- `SettingsShell` は情報設計とカテゴリ navigation に専念する。
- Debug Console と settings panel は content に専念し、位置や close interaction を持たない。

## Options Considered

| 選択肢                                         | 利点                       | 欠点                                                 |
| ---------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `RightToolFrame` / `StartupDialogFrame` へ集約 | 外枠責務が一箇所にまとまる | frame と content の境界を守る必要がある              |
| 各 component で個別調整                        | 局所変更が速い             | close button / scroll / z-index のズレが再発しやすい |
| `SettingsShell` に外枠も持たせる               | component 数は減る         | 設定情報設計と overlay platform 境界が混ざる         |

## Consequences

- right tool の位置、幅、scroll、close button は `RightToolFrame` が持つ。
- startup dialog の surface / backdrop / scroll は `StartupDialogFrame` と `overlay.css` が持つ。
- legacy CSS は fallback に縮退し、modern React overlay の見た目責務を取り戻さない。

## Review Conditions

- overlay 種別が増え、現在の frame 抽象では用途差を表現できなくなった場合。
- native dialog の platform 制約が変わり、別構成の方が単純になった場合。

## References

- `documents/design/frontend/settings-and-debug-ui.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
