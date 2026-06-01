# TASK-3023 simple-vrm chat overlay 再設計

- 作成日: 2026-04-24
- ステータス: Done
- 完了日: 2026-04-24
- 優先度: High

## 目的

`simple-vrm` の chat overlay を、背景映像と VRM の視認性を保ちながら会話内容を読める dark overlay へ再設計する。

## 背景

- 現状のチャット UI は legacy の bubble 構造と色に強く依存しており、背景上での面積、濃度、余白が scene-first の設計になっていない。
- 会話UIは利用頻度が高く、header や telop よりも main content の印象に与える影響が大きい。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3019-simple-vrm-main-content-visual-refine-epic.md`

## スコープ

- chat overlay の配置、最大幅、余白、bubble 面積の見直し
- message bubble の背景濃度、角丸、アイコン面、テキスト可読性の調整
- user / system / error 系 message の hierarchy 再整理

## 非対象

- メッセージのロジック変更
- telop / footer の調整
- Debug Console や設定パネルの message 表示変更

## 実装タスク

1. `sincroChatBox.css` を中心に、chat overlay の位置と幅を `scene を塞ぎにくい overlay` として再設計する。
2. message bubble の背景色、濃度、radius、padding を見直し、dialog / settings と同じ dark family に寄せる。
3. user / system / error 系で役割差は保ちつつ、色数を増やしすぎず機能用途に絞る。
4. mobile 相当幅でも bubble が過度に広がりすぎず、可読性が保てることを確認する。

## 想定変更箇所

- `sincromisor-frontend/src/styles/sincroChatBox.css`
- 必要に応じて `sincromisor-frontend/src/styles/common.css`

## 完了条件

- chat overlay が scene を塞ぎすぎない
- bubble が dark overlay family に入り、起動前 dialog / 設定パネルと断絶しない
- mobile 相当幅でも bubble の可読性が維持される

## 確認

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` の開始後画面で message 表示を desktop / mobile 相当幅で確認する

## 実施メモ

- このタスクでは chat の visual density に集中し、footer / telop とは分離して扱う。
