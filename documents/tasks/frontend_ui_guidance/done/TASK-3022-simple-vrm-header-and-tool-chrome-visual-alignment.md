# TASK-3022 simple-vrm header と右上ツール導線の visual align

- 作成日: 2026-04-24
- ステータス: Done
- 優先度: Medium

## 目的

開始後画面の header と右上ツール導線を、起動前 dialog / 設定パネル / Debug Console と同じ dark overlay family に寄せ、`本体だけ古い` 印象を減らす。

## 背景

- 現状の header は legacy 由来の装飾が強く、右上のツール導線だけ modern な panel tone を持っているため、1画面の中で文法が分裂して見える。
- 調査でも `設定だけ新しい / 本体だけ古い` 断絶が main content の違和感として最も大きかった。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3019-simple-vrm-main-content-visual-refine-epic.md`

## スコープ

- `simple-vrm` の開始後 header の visual redesign
- 右上ツールメニュー button / panel と header のトーン統一
- header 高さ、余白、装飾量、タイトル視認性の見直し

## 非対象

- chat bubble の調整
- telop / footer の調整
- Debug Console 本体の情報設計変更

## 実装タスク

1. `sincroHeaderBox.css` と関連 shell を見直し、header を scene を邪魔しすぎない dark overlay に再設計する。
2. 右上ツール導線のボタンと menu panel が header から浮きすぎないよう、色、枠線、影、余白を揃える。
3. タイトル、アイコン、メニューの視線誘導を調整し、装飾優先ではなく現在地と主要導線の視認性を優先する。
4. 狭幅時にも header が高さを取りすぎないことを確認する。

## 想定変更箇所

- `sincromisor-frontend/src/styles/sincroHeaderBox.css`
- `sincromisor-frontend/src/styles/sincroDebugConsole.css`
- 必要に応じて `sincromisor-frontend/src/react/app-shell/SincroPageAppShell.tsx`

## 完了条件

- header と右上ツール導線が同じ visual family に見える
- header が scene を覆う古いベタ帯として主張しすぎない
- 狭幅時にも header が過剰な高さを取らない

## 確認

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` の開始後画面で header と右上ツール導線を確認する

## 実施メモ

- このタスクでは header の見た目だけを扱い、chat / telop の論点を混ぜない。
