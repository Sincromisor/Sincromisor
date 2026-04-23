# TASK-3020 modern ページの viewport / responsive 前提是正

- 作成日: 2026-04-24
- ステータス: Done
- 優先度: High

## 目的

modern ページ群で layout viewport と実機幅の解釈を一致させ、以降の UI refine が desktop 縮小表示に引きずられない responsive 前提を整える。

## 背景

- 調査時点で `simple-vrm`、`vrm360`、`looking-glass-vrm` の HTML 入口に `meta viewport` が無く、狭幅実機で desktop 相当の layout viewport として扱われる。
- その結果、`@media` や container responsive の確認結果が信用しづらく、dialog や overlay の評価もぶれやすい。
- visual refine の前に、`実機幅で breakpoint が期待どおり効く` 状態を固定する必要がある。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3019-simple-vrm-main-content-visual-refine-epic.md`

## スコープ

- modern 3 ページの HTML に対する `meta viewport` 追加
- viewport 前提に伴う最小限の responsive 崩れ修正
- Playwright または同等手段による desktop / mobile 相当幅の再確認

## 非対象

- header / chat / telop の見た目刷新
- legacy global reset の本格整理
- トップページの responsive 改修

## 実装タスク

1. `simple-vrm`、`vrm360`、`looking-glass-vrm` の HTML へ `meta name="viewport" content="width=device-width, initial-scale=1"` を追加する。
2. viewport 追加で露呈する最小限の崩れを確認し、明らかな初回セットアップ dialog 崩れがあればこのタスクで吸収する。
3. desktop / mobile 相当幅で `window.innerWidth` と breakpoint 挙動を確認する。
4. responsive 前提の変更を設計文書へ反映すべき論点をメモとして残す。

## 想定変更箇所

- `sincromisor-frontend/src/simple-vrm/index.html`
- `sincromisor-frontend/src/vrm360/index.html`
- `sincromisor-frontend/src/looking-glass-vrm/index.html`
- 必要に応じて `sincromisor-frontend/src/react/dialog/configurationDialogSettings.css`

## 完了条件

- modern 3 ページに `meta viewport` が追加されている
- 狭幅時に layout viewport が desktop 固定のままにならない
- 初回セットアップ dialog が mobile 相当幅で致命的に崩れない

## 確認

- `cd sincromisor-frontend && npm run build`
- desktop / mobile 相当幅で `simple-vrm` の初回セットアップ dialog を確認する

## 実施メモ

- このタスクは visual polish ではなく、以後の確認結果を信頼できる状態にするための前提整備である。
- 実施結果:
  - `simple-vrm`、`vrm360`、`looking-glass-vrm` の HTML 入口に `meta name="viewport" content="width=device-width, initial-scale=1"` を追加した。
  - `cd sincromisor-frontend && npm run build` は 2026-04-24 に成功した。
  - Playwright で `simple-vrm` を desktop `1280x900` と mobile `390x844` で確認し、`window.innerWidth` が viewport 幅と一致することを確認した。
  - mobile `390x844` では初回セットアップ dialog が `366px` 幅で表示され、body の `scrollWidth` も `390px` に収まり、致命的な横崩れは確認されなかった。
  - `documents/design/frontend_ui.md` にはすでに modern ページの viewport / responsive 前提が反映されていたため、今回追加の設計更新は不要だった。
