# TASK-3002 設定メニューと Debug Console の UX 改善

- 作成日: 2026-04-19
- ステータス: Done
- 優先度: High

## 目的

設定メニューと Debug Console の情報設計と表示構造を見直し、一般ユーザーにとっては迷いにくく、開発者にとっては診断しやすい UI に改善する。

## 背景

- 現状は右上メニューから `設定カテゴリ` と `開発者向け診断` をそれぞれ別オーバーレイで開く構造になっており、同時に開くと重なりや圧迫が発生する。
- 設定パネル内には、実際に設定できる項目がない場合でも `起動オプション` が表示されることがあり、空カテゴリまたは価値の低い説明が残る。
- 設定パネルは縦方向に長く、カテゴリを開いたままだと画面内に収まらず、目的の項目へ到達しづらい。
- Debug Console は大画面時に情報を一度に出しすぎており、最初に見るべき情報と詳細診断情報の優先順位が分かりにくい。
- 設定パネルと Debug Console は同じ右側ツール群として見える一方で、レイアウト、タイポグラフィ、操作導線が揃っておらず、同じ操作レイヤーとして理解しにくい。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3000-settings-panel-and-debug-console-role-separation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3001-settings-menu-segmentation.md`

## スコープ

- 右上メニューから開く設定パネルと Debug Console の表示関係の見直し
- 設定パネルのカテゴリ構成、初期展開状態、空カテゴリ表示条件の見直し
- `起動オプション` と `開発者向け` の導線整理
- Debug Console の情報階層、既定表示、タブやセクション構成の見直し
- 右側ツール UI 全体のサイズ、余白、閉じる導線、見た目の整合
- 設計ドキュメントへの反映

## 非対象

- WebRTC / Audio / Gaze / SDP の診断ロジック自体の再設計
- 新しい設定項目の追加
- 設定保存方式や通信仕様の変更
- 起動前 dialog 全体のフロー変更

## 対応方針

1. 設定パネルと Debug Console を、同時に重ならない表示構造へ整理する。
2. 一般ユーザーが触る設定と、開発者だけが使う診断 UI を操作導線レベルで分離する。
3. 頻度の高い設定に早く到達できるよう、縦長化しにくいカテゴリ構成へ調整する。
4. 空のカテゴリや価値の低い補助文言は表示しない方針を徹底する。
5. Debug Console は概要確認と詳細診断を段階的に辿れる構成にする。

## 実装タスク

1. 現状の設定パネル、右上メニュー、Debug Console の開閉関係と重なり方を整理し、相互排他または単一シェル化の方針を決める。
2. 設定パネルから `開発者向け診断を開く` を実行した時に、別ダイアログが重なるのではなく、迷いの少ない遷移になるよう導線を見直す。
3. `起動オプション` について、対象項目が存在しないページではカテゴリ自体を非表示にするか、別カテゴリへ吸収する。
4. 設定カテゴリの初期展開状態を見直し、縦に長くなりすぎない既定状態へ調整する。
5. 設定トグル群のサイズ、行揃え、密度を見直し、ラベル長が異なっても一覧性を損ねにくいレイアウトへ整える。
6. Debug Console の既定表示を `Overview` 中心に再構成し、詳細診断はタブまたは段階的表示で辿れるようにする。
7. Debug Console 内で `監視` と `調整` が混在している箇所を見直し、必要に応じて `高度な調整` として分離する。
8. 設定パネルと Debug Console のタイポグラフィ、余白、閉じる導線、見出し表現を揃え、同じツールレイヤーとして理解しやすい見た目へ整える。
9. `documents/design/frontend_ui.md` に、右側ツール UI の構成、表示ルール、対象ユーザー、優先情報、空カテゴリ非表示方針を追記する。

## 想定変更箇所

- `sincromisor-frontend/src/partials/sincroBody.html`
- `sincromisor-frontend/src/partials/debugConsole.html`
- `sincromisor-frontend/src/styles/sincroDebugConsole.css`
- `sincromisor-frontend/src/react/simple-vrm/SimpleVrmControlPanel.tsx`
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/react/simple-vrm/panelStyles.ts`
- `sincromisor-frontend/src/react/app/uiTuning.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- 必要に応じて `sincromisor-frontend/src/react/dialog/**`
- `documents/design/frontend_ui.md`

## 具体的な見直し観点

- 表示構造:
    - 設定パネルと Debug Console を同時表示させない。
    - 右上メニューのクリック結果が、`別ウィンドウが重なる` ではなく `同じツール領域が切り替わる` と理解できる構造を優先する。
- 設定パネル:
    - 空カテゴリを出さない。
    - 既定では必要最小限のカテゴリだけ開く。
    - 長い説明文は常時露出せず、補助文や tooltip へ整理する。
    - トグルサイズや行高を揃え、視線移動だけで比較しやすくする。
- Debug Console:
    - 最初に見るべき接続概要と、詳細ログや SDP を分ける。
    - 大画面でも情報を一気に並べすぎず、段階的に辿れる構造を優先する。
    - 監視情報と開発用調整項目の境界を明確にする。
- 文言と見た目:
    - 設定パネルと Debug Console の見出し、閉じるボタン、余白、フォント方針を揃える。
    - 一般ユーザー向け設定と開発者向け診断で、対象ユーザーが視覚的にも分かるようにする。

## 完了条件

- 設定パネルと Debug Console を同時に開いた時の重なり問題が解消される。
- 空の `起動オプション` が表示されなくなる、または別の適切な形へ整理される。
- 設定パネルの既定状態で縦長すぎる問題が緩和される。
- Debug Console が概要確認と詳細診断を段階的に辿れる構造になる。
- 右側ツール UI の構成方針と表示ルールが `documents/design/frontend_ui.md` に反映される。

## 確認

- 一般ユーザー視点で、設定変更中に別の大きな診断 UI が重なって戸惑わないことを確認する。
- 設定パネルの初期表示で、主要設定へ短いスクロールで到達できることを確認する。
- 開発者視点で、Debug Console から接続概要と詳細診断の双方に引き続き到達できることを確認する。
- ページ差分に応じて、不要なカテゴリや項目が露出しないことを確認する。

## 実施メモ

- 初回検討時点では、設定パネルと Debug Console が別々の overlay として表示され、開発者向け診断を開くと UI が重なって見える。
- `起動オプション` はサポート項目がない場合でもカテゴリ自体が表示されることがあり、一般ユーザーにはノイズになっている。
- Debug Console は大画面時に複数セクションを同時表示するため、最初に見るべき情報が埋もれやすい。
- 設計更新は必須とし、UI 実装だけ先行して設計が古くならないよう同一タスク内で反映する。
- 2026-04-19: 設定パネルと Debug Console は `DebugConsoleManager` 側で相互排他にし、同じ右側ツール領域を切り替える挙動へ整理した。
- 2026-04-19: 設定パネルは一般ユーザー向けのシェル見出しに統一し、表示設定は既定で閉じることで縦長化を抑えた。
- 2026-04-19: Debug Console は `Overview` 優先の導線に更新し、Audio / Gaze の調整項目を `高度な調整` として折りたたみ表示に整理した。
- 2026-04-19: `documents/design/frontend_ui.md` に右側ツール UI の表示ルールと、今回の UX 整理内容を追記した。
