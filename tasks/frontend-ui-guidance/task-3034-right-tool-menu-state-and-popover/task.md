# TASK-3034 右上ツールメニューの状態表示とpopover整理

- 作成日: 2026-05-01
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3033`

## 目的

`simple-vrm` の右上メニューを、単なる歯車ドロップダウンではなく、設定パネルと Debug Console を切り替える「右側ツール switcher」として理解しやすい見た目・状態表示へ整える。

## 背景

- 現状は右上ボタンが歯車アイコンのみで、開くまで `設定` と `開発者向け診断` の入口だと分かりにくい。
- Debug Console 表示中でも右上メニューを開けるが、現在どの panel が開いているかが menu item に反映されない。
- `DESIGN.md` の dark surface / compact typography / rounded geometry は活かせているが、header 右端から開く popover としての連続性はまだ弱い。

## スコープ

- `RightToolMenu` の表示文言、active state、ARIA属性
- `#debugMenuButton` / `#debugMenuPanel` の popover 表現
- desktop / mobile の縮退ルール

## 非対象

- 設定パネル内カテゴリの整理
- Debug Console content の layout 変更
- `RightToolFrame` の位置・scroll 責務変更

## 実装タスク

1. `RightToolMenu` で `activePanel` を参照し、menu item に active state を表示する。
2. desktop では歯車に短い補助ラベルを添える案を実装または検証する。
3. mobile では現状の icon button を維持しつつ、tap target と popover 幅を安定させる。
4. `aria-label` / `aria-current` / `aria-pressed` の扱いを整理し、現在のツールが支援技術にも伝わるようにする。
5. `sincroDebugConsole.css` の menu 周辺を header と連続する popover 表現へ調整する。

## 完了条件

- 右上メニューを開いた時に、現在開いている `設定` または `診断` が分かる。
- `設定` と `診断` の用途差が短い説明または視覚表現で分かる。
- menu open 中も header / panel / popover が不自然に重ならない。
- desktop `1280x720` と mobile `390x844` で表示が崩れない。

## 確認

- `simple-vrm` desktop / mobile で右上メニュー open / close を確認する。
- 設定パネル表示中、Debug Console 表示中、panel 未表示時の active state を確認する。
