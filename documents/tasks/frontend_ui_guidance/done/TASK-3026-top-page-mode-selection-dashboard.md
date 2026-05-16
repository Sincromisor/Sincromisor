# TASK-3026 top page mode selection dashboard

- 作成日: 2026-04-25
- ステータス: Done
- 優先度: Medium

## 目的

公開済みトップページ `https://sincromisor.negix.org/` を、単なるリンク集ではなく、ユーザーが最短で適切な起動モードを選べる mode selection dashboard として再設計する。

## 背景

- 現状のトップページは `Recommended` / `Looking Glass` / `Source Code` の縦並びリンクに近く、初見ユーザーにとって「まず何を押すべきか」が弱い。
- desktop `1280x720` では `Looking Glass` 導線の下部が初期表示から外れやすく、mobile `390x844` では `Source Code` がほぼ画面外に押し出される。
- `DESIGN.md` は模倣対象ではなく、以下の考え方をトップページへ適用するための参考とする。
    - 暗い没入面の上に主役コンテンツを浮かせる。
    - 機能色を限定し、主要操作だけを強調する。
    - アプリ導線として文字階層と余白をコンパクトにする。
    - pill / circle 系の操作感で触れる対象を明確にする。

## 関連設計

- `DESIGN.md`
- `documents/design/frontend_ui.md`
- `sincromisor-frontend/src/index.html`
- `sincromisor-frontend/src/styles/index.css`
- `sincromisor-frontend/src/styles/uiFoundation.css`
- `sincromisor-frontend/src/styles/common.css`

## スコープ

- トップページの情報設計見直し
- `Simple Interface` を主導線にした起動モード選択 UI
- `360deg Camera` / `Looking Glass` の副導線化と状態表示
- mobile / desktop の responsive layout 改善
- アクセシビリティと HTML セマンティクスの改善
- 必要に応じた `documents/design/frontend_ui.md` への設計同期

## 非対象

- `simple-vrm` / `vrm360` / `looking-glass-vrm` 各画面本体の UI 改修
- WebRTC 接続仕様、設定取得 endpoint、DataChannel payload の変更
- 新しい 3D rendering 機能の追加
- `DESIGN.md` の Spotify visual をそのまま複製すること

## 実装タスク

1. トップページの導線を `Simple Interface` 主導線、`360deg Camera` / `Looking Glass` 副導線、GitHub 補助リンクとして再構成する。
2. `form` + `button formaction` の導線を見直し、ページ遷移として自然な `<a>` ベースのカード/ボタンリンクへ置き換える。
3. `index.html` に `viewport` meta を追加し、画像の `alt` を装飾/情報の役割に応じて整理する。
4. `index.css` の巨大な `clamp(..., 4.5rem)` 前提を改め、見出し、本文、CTA、状態ラベルの文字階層を compact app UI として再設計する。
5. 既存の `uiFoundation.css` token と modern ページの暗い overlay 表現を活用し、トップページから本体画面へ視覚的に接続する。
6. `Recommended` / `Experimental` / `Device dependent` などの状態を、色だけに依存しないラベルとして表示する。
7. desktop では主カード + 副カードの dashboard layout、mobile では縦積みでも主要導線が初期表示に収まりやすい layout にする。
8. hover / focus-visible / active 状態を用意し、キーボード操作でも現在位置が分かるようにする。
9. 実装方針が `frontend_ui.md` のトップページ/導線方針とずれる場合は、設計文書の更新要否を明記し、必要なら同時更新する。

## 想定変更箇所

- `sincromisor-frontend/src/index.html`
- `sincromisor-frontend/src/styles/index.css`
- 必要に応じて `documents/design/frontend_ui.md`

## 完了条件

- 初見ユーザーが `Simple Interface` を推奨入口として即座に認識できる。
- desktop `1280x720` の初期表示で主要導線と副導線の概要が把握できる。
- mobile `390x844` の初期表示で少なくとも推奨入口と副導線の存在が把握できる。
- `360deg Camera` と `Looking Glass` が experimental / device dependent な導線として過度に主張しない。
- GitHub リンクが補助情報として扱われ、起動モード選択を邪魔しない。
- keyboard focus、link semantics、画像 `alt`、viewport 設定が整理されている。
- `DESIGN.md` の思想は反映されているが、Spotify 固有の配色・ブランド表現の模倣になっていない。

## 確認

- `cd sincromisor-frontend && npm run build`
- `npm run dev` または `vite preview` で `/` を確認
- desktop `1280x720` でトップページの初期表示を確認
- mobile `390x844` でトップページの初期表示を確認
- キーボード Tab 操作で各導線の focus-visible 表示を確認

## 実施メモ

- 2026-04-25 時点の公開ページ確認では、desktop `1280x720` で `Looking Glass` ボタン下部が fold 付近にあり、mobile `390x844` では `Source Code` 見出しが初期表示外だった。
- 現状の主な対象は `sincromisor-frontend/src/index.html` と `sincromisor-frontend/src/styles/index.css` に閉じられる見込み。
- 実施結果:
    - `sincromisor-frontend/src/index.html` を `form` + `button formaction` から `<a>` ベースの mode card 導線へ変更し、`Simple Interface` を主導線、`360deg Camera` / `Looking Glass` を副導線、GitHub を補助リンクとして再構成した。
    - `meta viewport` を追加し、ヘッダーアイコンは装飾画像として `alt=""` に整理した。
    - `sincromisor-frontend/src/styles/index.css` を compact dashboard 用に再設計し、既存 `uiFoundation.css` の dark surface / compact typography / pill geometry と接続した。
    - `Recommended` / `Experimental` / `Device dependent` をテキストラベルとして表示し、色だけに依存しない状態表現にした。
    - `documents/design/frontend_ui.md` にトップページ導線方針と確認基準を同期した。
    - `cd sincromisor-frontend && npm run build` は 2026-04-25 に成功した。既存の large chunk warning は継続。
    - Playwright + Vite dev server で `/` を desktop `1280x720`、mobile `390x844` で確認し、主要導線と副導線が初期表示内に収まることを確認した。
    - Tab 操作で header brand と GitHub に focus が移ることを確認した。リンク共通の `:focus-visible` outline は mode card にも適用済み。
    - 追加調整として `public/images/modes/` に各起動モードの概念 SVG を追加し、mode card へ `<img>` 参照で埋め込んだ。将来の差し替えは同パスの SVG 更新で対応できる。
