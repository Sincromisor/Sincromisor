# Document production sincro motion application gates

## 背景 / 目的

observe-only、Hand / ROI、composer dry-run、metrics comparison、optional bone / degradation 検証が揃っても、どの条件を満たしたら本番適用へ進むかが文書化されていないと、判断が属人的になる。

本タスクでは本番 `sincro` motion pipeline を適用へ進める gate を設計正本へ明記する。

## 完了条件（受け入れ条件）

- [ ] `documents/design/frontend/character/motion.md` に production application gate 節を追加し、observe-only、dry-run、arm flag、torso / shoulder migration、semantic / finger、全面 `setNormalizedPose()` の各段階の entry / exit criteria を明記する。
- [ ] `documents/design/frontend/character/tracking.md` に Hand / Face ROI、degradation、camera quality が gate に与える条件を追記する。
- [ ] `documents/design/frontend/character/overview.md` に roadmap から本番組み込みへ進む段階図または短い要約を追加する。
- [ ] gate は `required artifacts`、`required metrics status`、`required manual verification`、`rollback condition` を持つ表にする。
- [ ] gate は task id へ依存しすぎず、artifact 名と設計上の条件で読めるようにする。task id は補助リンクに留める。
- [ ] production TypeScript code は変更しない。

## 設計判断（着手前に確定済み）

- gate の正本は `documents/design/frontend/character/motion.md` に置く。roadmap は research 文書であり、現在仕様の正本ではないため。
- tracking 由来の gate は `tracking.md`、全体像は `overview.md` に要約する。すべてを 1 文書に詰め込む案は、責務境界が読みにくくなるため採用しない。
- gate は PASS / FAIL の自動判定だけにしない。実機・複数 VRM・主観確認が必要な項目を明示する。

## スコープ境界

- 本タスクでやること: 設計文書の gate 記述、artifact 導線、rollback 条件。
- 本タスクでやらないこと: production code 変更、タスク生成、metrics 実装。
- 依存タスクとの境界: comparison / migration plan / verification tasks が gate の入力を作る。本タスクはそれを設計正本へまとめる。

## 実装方針（既存コード整合: file:line）

- roadmap は大フェーズと gate を research として整理している（`documents/research/character_animation/roadmap.md:261`）。
- roadmap は現行設計文書への反映方針を明記している（`documents/research/character_animation/roadmap.md:568`）。
- `motion.md` はすでに composer の本番移行 gate を後続 task に残している（`documents/design/frontend/character/motion.md:173`）。
- `tracking.md` は degradation policy と Hand / Face ROI の現在仕様を持つ（`documents/design/frontend/character/tracking.md:90`）。

## テスト

- `npm run tasks:check`
- `npm run tasks:index:check`
- Markdown のみ変更のため frontend build / test は不要。

## ドキュメント同期の要否

要。このタスク自体が設計文書同期である。対象は `documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/overview.md`。
