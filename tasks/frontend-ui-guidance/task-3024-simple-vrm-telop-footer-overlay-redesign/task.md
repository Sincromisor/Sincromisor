# TASK-3024 simple-vrm telop / footer overlay 再設計

- 作成日: 2026-04-24
- ステータス: Done
- 優先度: Medium

## 目的

`simple-vrm` の telop / footer を、常時ベタ帯として主張しすぎない overlay へ整理し、可読性と没入感を両立する。

## 背景

- 現状の footer は header と同系のベタ帯に近く、main content の下端を強く切って見せる。
- `text_ch` と別に `telop_ch` は視認性が重要だが、scene 全体を重く見せる実装は避けたい。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3019-simple-vrm-main-content-visual-refine-epic.md`

## スコープ

- telop / footer の背景面、余白、高さ、文字サイズの見直し
- overlay としての可読性確保
- mobile 相当幅での圧迫感軽減

## 非対象

- telop 受信ロジック変更
- chat bubble の再設計
- header の再設計

## 実装タスク

1. `sincroFooterBox.css` を中心に、footer を常設ベタ帯ではなく translucent overlay として再設計する。
2. telop 文字サイズ、余白、高さを見直し、scene の視認領域を圧迫しすぎないよう調整する。
3. 背景とのコントラスト確保方法を、全幅の濃い帯ではなく局所的な overlay 面を基本に整理する。
4. mobile 相当幅で高さと可読性のバランスを確認する。

## 想定変更箇所

- `sincromisor-frontend/src/styles/sincroFooterBox.css`
- 必要に応じて `sincromisor-frontend/src/styles/simple.css`

## 完了条件

- telop / footer がベタ帯として主張しすぎない
- 可読性を損なわず overlay として馴染む
- mobile 相当幅でも footer が過剰に高さを取らない

## 確認

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` の開始後画面で telop を desktop / mobile 相当幅で確認する

## 実施メモ

- telop は可読性優先だが、`常に濃い全幅帯で守る` 以外の手段を優先して検討する。
- `sincroFooterBox.css` を translucent overlay panel に更新し、`simple.css` 側で下辺中央配置と mobile 余白を調整した。
- `cd sincromisor-frontend && npm run build` は成功した。
