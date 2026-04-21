# TASK-3010 CSS 基盤整備と legacy style 隔離

- 作成日: 2026-04-21
- ステータス: Done
- 完了日: 2026-04-21
- 優先度: High

## 目的

フロントエンドの CSS を `デザイントークン + レイヤ構造 + 命名規約` で再定義し、legacy CSS と modern React UI の二重責務を解消するための基盤を整える。

## 背景

- 現在の CSS は `src/styles/*` の legacy 群と、React 側コンポーネント CSS が混在している。
- 特に起動前設定ダイアログでは `configurationDialogSettings.css` と `sincroConfigurationDialog.css` が同一体験を支えており、責務分離が崩れている。
- `BEM を使っているつもりだが一貫していない`、`nesting を使う箇所と使わない箇所が混在する`、`細かい調整の積み重ねで複雑化した` という課題がある。
- `DESIGN.md` を参考にするにしても、まず Sincromisor の CSS 設計原則へ翻訳する必要がある。

## 関連設計

- `DESIGN.md`
- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3008-frontend-modernization-foundation-and-legacy-retirement.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3009-frontend-support-matrix-and-page-classification.md`

## スコープ

- CSS トークン定義
- CSS レイヤ構造の設計
- 命名規約と `nesting` 利用ルールの定義
- 起動前設定ダイアログの CSS 二重責務解消方針整理
- legacy CSS 隔離方針の整理

## 非対象

- 全ページのデザイン全面刷新
- コンポーネント単位の見た目微調整を大量に行うこと
- すべての legacy CSS をこのタスクだけで削除すること
- React / Core のイベント境界整理
- `modern / legacy / deprecated` のページ分類をここでやり直すこと

## 実施結果

### 1. CSS foundation を追加

- `sincromisor-frontend/src/styles/uiFoundation.css` を追加し、`@layer legacy, tokens, foundation, components, utilities;` を宣言した。
- `--sincro-*` で色、余白、角丸、影、タイポ、z-index の最小 token 群を定義した。
- `src/index.html` と `src/partials/baseHeader.html` から foundation を先に読み込む構成へ更新した。

### 2. legacy CSS を隔離

- `src/styles/common.css` を `@layer legacy` に移し、既存の `--baseTextColor` などは foundation token の alias として維持した。
- `src/styles/sincroConfigurationDialog.css` を `@layer legacy` に移し、責務を `dialog 要素 / bridge DOM / legacy fieldset fallback` に限定した。
- React UI の見た目責務を legacy CSS に持ち込まない前提を設計書へ反映した。

### 3. modern React CSS の責務を整理

- `src/react/settings-shell/settingsShell.css` を `@layer components` 化し、token ベースへ更新した。
- `src/react/dialog/configurationDialogSettings.css` を `@layer components` 化し、`reactPrimarySettingsEnabled` 時の dialog surface / backdrop / footer / category card の責務をここへ集約した。
- 起動前設定 dialog の二重責務は、`legacy bridge` と `React 主導 UI` に分離して整理した。

### 4. 設計文書を同期

- `documents/design/frontend_ui.md` に CSS layer、token、命名、nesting、起動前 dialog の責務境界、CSS ファイル分類を追記した。

## 先行条件

- `TASK-3009` で決めた `守る対象ページ` と `legacy として隔離する対象` を入力として扱う。
- 本タスクでは `どのページを保守対象にするか` は再判断せず、CSS 側の責務整理に集中する。

## 対応方針

1. まず `トークン` と `責務レイヤ` を決め、個別セレクタ修正はその後に行う。
2. 命名規約は `component root + element/modifier/state` を基本とし、長大化しすぎた class 名も見直し対象に含める。
3. `nesting` は全面禁止でも全面自由でもなく、使ってよい範囲を決める。
4. 起動前設定ダイアログを基準ケースにして、modern CSS と legacy CSS の責務境界を整理する。
5. legacy CSS は `互換維持のため何でも抱える層` にせず、隔離対象として扱う。

## 整理チェックリスト

### 1. トークンと基盤

- [x] 色、余白、角丸、影、タイポ、z-index のトークンが定義されている
- [x] `DESIGN.md` から取り込む原則と取り込まない要素が整理されている
- [x] 共通 UI で再利用すべき token 群が定義されている

### 2. CSS レイヤと命名

- [x] `tokens / foundation / components / utilities / legacy` などの責務レイヤが定義されている
- [x] component root 起点の命名規約が定義されている
- [x] state class の扱いが整理されている
- [x] `nesting` 利用ルールと禁止事項が定義されている

### 3. 起動前設定ダイアログ整理

- [x] `configurationDialogSettings.css` の責務が明確化されている
- [x] `sincroConfigurationDialog.css` の責務が明確化されている
- [x] React 主導領域と legacy bridge 領域の境界が整理されている
- [x] `!important` や互換保険の扱いを減らす方針がある

## 実装タスク

1. 既存 CSS ファイル群を棚卸しし、`modern component CSS`、`global foundation`、`legacy` に分類する。
2. Sincromisor 向けの CSS トークン方針を定義する。
3. CSS レイヤ構成と配置方針を定義する。
4. 命名規約と `nesting` 利用ルールを定義する。
5. 起動前設定ダイアログの CSS 二重責務を整理し、どちらへ責務を寄せるか方針を決める。
6. 後続タスクで移行対象にする CSS ファイル群と、legacy として凍結するファイル群を整理する。
7. `documents/design/frontend_ui.md` に CSS 基盤方針を反映する。

## 想定変更箇所

- `documents/design/frontend_ui.md`
- 必要に応じて `README.md`
- `sincromisor-frontend/src/styles/*.css`
- `sincromisor-frontend/src/react/dialog/configurationDialogSettings.css`
- `sincromisor-frontend/src/react/settings-shell/settingsShell.css`
- 必要に応じて `sincromisor-frontend/postcss.config.js`

## 完了条件

- CSS のトークン、レイヤ、命名、`nesting` 方針が文書化されている
- 起動前設定ダイアログの CSS 二重責務に対する解消方針が定義されている
- modern 側で新規追加する CSS のルールが明確になっている
- legacy CSS をどこまで守るかが整理されている

## 確認

- 定義した CSS 方針が、設定ダイアログや設定シェルで実際に適用可能な粒度であることを確認する
- `DESIGN.md` の参照が、見た目の丸写しではなく原則の翻訳になっていることを確認する
- 後続タスクが CSS ファイルの責務を迷わず追えることを確認する

## 実施メモ

- 本タスクは `BEM をちゃんとやる` こと自体が目的ではなく、`CSS の責務が読める状態を作る` ことが目的である。
- 実装変更に着手した場合は、`documents/design/frontend_ui.md` の更新が必要になる。
