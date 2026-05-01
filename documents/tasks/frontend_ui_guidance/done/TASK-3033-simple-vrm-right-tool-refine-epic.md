# TASK-3033 simple-vrm 右側ツールUI refine epic

- 作成日: 2026-05-01
- ステータス: Done
- 優先度: High

## 目的

`simple-vrm` の開始後 UI について、右上の設定・デバッグメニューと右側ツール領域を、`DESIGN.md` と `documents/design/frontend_ui.md` の方針に沿って段階的に磨き込む。

## 背景

- `TASK-3019` から `TASK-3032` までで、main content、chat、telop、右側 overlay chrome、起動前 dialog は大きく整った。
- Playwright 確認では、右上の歯車メニュー、設定パネル内の `開発者向け` カテゴリ、Debug Console の開閉導線がまだ別々の語彙に見える。
- `frontend_ui.md` では、設定パネルと Debug Console を右側ツール領域に属する相互排他 UI とし、一般ユーザー向け設定と開発者向け診断を視覚的・情報密度的に分離する方針になっている。
- 1つのタスクで進めるには範囲が広いため、右上メニュー、設定から診断への導線、設定パネル密度、Debug Console mobile、検証/設計同期へ分割する。

## Playwright確認メモ

- 確認日時: 2026-05-01
- 対象: `http://127.0.0.1:5173/simple-vrm/`
- viewport:
  - desktop: `1280x720`
  - mobile: `390x844`
- backend 未起動のため `/api/v1/RTCSignalingServer/config.json` は 404、media permission は `NotAllowedError` になる。今回の判定対象は UI layout / 導線 / visual consistency とする。

確認した状態:

- 起動前 dialog は、dark surface と左右分割設定シェルの方向性が成立している。
- 右上メニューは `設定` と `開発者向け診断` の2項目だけで軽いが、開く前は歯車アイコンのみで、開いた後に何が起きるかが予測しづらい。
- 設定パネル内にも `開発者向け` カテゴリがあり、右上メニューの `開発者向け診断` と役割が二重に見える。
- Debug Console 表示中でも右上メニューを開けるため、active panel の上に小メニューが重なり、ユーザーには「今のパネルの一部」なのか「別の切替UI」なのかが少し曖昧に見える。
- mobile では設定パネルのカテゴリ一覧が初期表示の大部分を占め、本文の開始位置が下がる。Debug Console は全幅に近く表示できるが、ヘッダー内のタイトル・説明・停止ボタンが窮屈になりやすい。

## 分割タスク

- `TASK-3034`: 右上ツールメニューの active state / popover 表現を整理する。
- `TASK-3035`: 設定パネル内の `開発者向け` 二重導線をなくし、診断への handoff を整理する。
- `TASK-3036`: 開始後設定パネルのカテゴリナビ密度と初期表示を改善する。
- `TASK-3037`: Debug Console の mobile header / tabs / 主操作配置を改善する。
- `TASK-3038`: 右側ツール領域の Playwright 回帰確認と設計文書同期を行う。

## 非対象

- WebRTC endpoint / payload の変更
- Debug Console の診断ロジック追加
- 起動前 dialog の大規模再設計
- VRM scene / camera / lighting の再設計
- `vrm360` / `looking-glass-vrm` 固有UIの新規追加

## 完了条件

- 分割タスクがすべて完了している。
- 右上メニューを開いた時に、`設定` と `診断` の用途差が視覚的にも文言的にも分かる。
- 設定パネル内で `開発者向け` が一般カテゴリと同じ重さで二重表示されない。
- desktop / mobile の右側ツールUIで、close button、tabs、主操作、本文が重ならない。
- `npm run build` と Playwright 確認結果が記録されている。

## 実施メモ

- 実装時は既存の `RightToolFrame` / `SincroAppRightToolPanelService` / `SettingsShell` の責務境界を維持する。
- overlay frame の位置・close・scroll 責務は `src/react/overlay/*` と `overlay.css` に残し、設定コンテンツや Debug Console content CSS へ戻さない。
- `TASK-3034` から `TASK-3038` までの分割タスクは完了。`npm run build` と Playwright により、`simple-vrm` desktop / mobile、`vrm360` desktop、`looking-glass-vrm` desktop の右側ツールUIに明確な崩れがないことを確認した。
- backend 未起動に由来する `/api/v1/RTCSignalingServer/config.json` 404 と media permission error は、右側ツールUIの layout 判定対象外として扱った。
