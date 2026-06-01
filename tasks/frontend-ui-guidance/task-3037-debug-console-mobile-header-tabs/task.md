# TASK-3037 Debug Console mobile header/tabs改善

- 作成日: 2026-05-01
- ステータス: Done
- 優先度: Medium
- 親タスク: `TASK-3033`

## 目的

Debug Console を mobile 幅で開いた時に、header、説明文、停止ボタン、tabs が窮屈に見えないよう配置と折り返しを改善する。

## 背景

- desktop では Debug Console は大きな右側領域として成立している。
- mobile `390x844` では Debug Console が全幅に近く表示される一方、header 内のタイトル・説明・停止ボタンが詰まりやすい。
- tabs は複数行に折り返せるが、主操作と近接すると視線の流れが弱くなる。

## スコープ

- `DebugConsole` の header layout
- Debug Console tabs の mobile spacing / wrapping
- `sincroDebugConsole.css` の responsive 調整

## 非対象

- 診断データの追加・削除
- 右上メニューの active state
- 設定パネルのカテゴリ整理

## 実装タスク

1. mobile 幅で Debug Console header を縦積みまたは2段配置へ切り替える。
2. `接続を停止` ボタンを header 内で無理に横並びにせず、主操作として読みやすい位置へ移す。
3. tabs の gap、min-width、折り返しを調整し、押しやすさと情報密度を両立する。
4. close button と header content が重ならないよう、safe padding を確認する。
5. desktop 表示の grid layout に不要な副作用が出ていないことを確認する。

## 完了条件

- mobile `390x844` で Debug Console header、説明文、停止ボタン、tabs が重ならない。
- tabs が折り返しても読みにくくならず、各 panel へ移動しやすい。
- desktop `1280x720` の Debug Console 表示に明確な崩れがない。

## 確認

- `simple-vrm` mobile で Debug Console を開き、header / tabs / Overview を確認する。
- `simple-vrm` desktop で Debug Console を開き、既存レイアウトの維持を確認する。
