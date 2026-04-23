# TASK-3021 main content 向け legacy global style 影響の隔離

- 作成日: 2026-04-24
- ステータス: Done
- 完了日: 2026-04-24
- 優先度: High

## 目的

`simple-vrm` の main content が legacy global reset や centering 副作用に引きずられないよう、modern 画面の見た目責務を追いやすい状態へ整理する。

## 背景

- `common.css` の `* { margin: 0 auto; padding: 0; }` のような global 指定は、main content の整列、幅解釈、余白設計に副作用を与えやすい。
- `TASK-3010` で CSS foundation は整えたが、main content 側にはなお legacy 側の広い効き方が残っている。
- header / chat / telop の個別 refine に入る前に、土台の責務境界を狭めておかないと調整量が増え続ける。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3010-css-foundation-and-legacy-style-isolation.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3019-simple-vrm-main-content-visual-refine-epic.md`

## スコープ

- `common.css` を中心とした global reset / centering の影響棚卸し
- modern main content で不要な legacy 挙動の限定化または隔離
- `simple-vrm` の基礎レイアウトを component 単位で制御しやすくするための最小修正

## 非対象

- header / chat / telop の意匠刷新
- すべての legacy CSS の削除
- `vrm360` / `looking-glass-vrm` の固有 UI redesign

## 実装タスク

1. `common.css`、`simple.css`、main content 近辺の global 指定を棚卸しし、modern ページへ不要に効いているものを特定する。
2. `margin: 0 auto` のような広域指定を、必要箇所だけへ限定するか、modern UI では上書きではなく責務分離で解消する。
3. `simple-vrm` の app shell 上で、header / chat / footer の配置計算に不要な global centering が残らないよう調整する。
4. `vrm360` / `looking-glass-vrm` でも shared 変更の副作用が大きくないことを確認する。

## 想定変更箇所

- `sincromisor-frontend/src/styles/common.css`
- `sincromisor-frontend/src/styles/simple.css`
- 必要に応じて `sincromisor-frontend/src/react/app-shell/SincroPageAppShell.tsx`

## 完了条件

- main content の幅解釈や整列が global reset に強く依存しない
- header / chat / footer の後続調整を component 単位で進めやすい
- shared 変更で `vrm360` / `looking-glass-vrm` に致命的な崩れが出ない

## 確認

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` の開始後 main content を desktop / mobile 相当幅で確認する

## 実施メモ

- このタスクは `見た目を完成させる` ことよりも、後続タスクでの視覚調整の土台を作ることを優先する。
- 2026-04-24 実施:
  - `common.css` の global reset を page class 起点に切り替え、modern ページでは `margin: 0`、legacy 導線では従来の auto-centering を適用する構成へ整理した
  - `simple-vrm`、`vrm360`、`looking-glass-vrm` の `body` に `sincroPage--modern`、トップページに `sincroPage--legacyCentered` を付与して責務境界を明示した
  - React app shell の root に `sincroPageShell--modern` を付与し、main content が modern shell の責務であることを追いやすくした
  - `cd sincromisor-frontend && npm run build` が成功した
  - Playwright で `simple-vrm` desktop 幅、`vrm360` mobile 幅、トップページの shared 変更影響を確認し、modern main content 直下コンテナの左右 margin が `0px` で揃うことを確認した
