# Review: task-260628161554-character-animation-3-0-phase-11-constrained-ik-refinement

## 判定

APPROVED

前回 blocking だった candidate wrist 生成式と deterministic order は受け入れ条件で一意に固定された。改訂で追加された cost 条件も既存 `constraint.collisionAvoided` と整合しており、新たな破綻は見つからない。

## 指摘事項

なし

## 実装者への申し送り

- candidate index は task.md の指定どおり、original を index `0` に固定し、以降は reach outer / elevation middle / depth inner の順で列挙すること。同点時の採用結果と `selectedCandidateIndex` に影響するため、テストでも順序を固定して確認する。
- candidate wrist 生成式は task.md の式をそのまま正本にすること。depth scale、elevation offset、reach scale の適用順を変えると deltaRatio と cost が変わる。
- refinement enabled の評価中は `lastPoleDirection` を更新せず、選ばれた candidate の pole direction だけを最後に commit すること。既存 `solve()` は `prepareTarget()` / `solveLocalQuaternions()` / `buildConstraintResult()` 後に `lastPoleDirection` を更新する構造である。
- cost の collision penalty は `constraint.collisionAvoided === true` を見ること。reason code 名の列挙に戻すと、前回の曖昧さが再発する。
- `documents/design/frontend/character/motion.md` の同期は受け入れ条件に含まれているため、実装と同時に更新すること。
