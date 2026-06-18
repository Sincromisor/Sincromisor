# Review: task-3116-sincro-pose-ik-observability-verification-and-design-sync

## 判定

APPROVED

前回の High 指摘だった VRM / viewport / NG 条件 / 保存先の非一意性は、現行 `task.md` の検証条件と保存先指定で解消済み。公開挙動・設計同期先も受け入れ条件に明記されており、実装前に blocking となる欠落は見つからない。

## 指摘事項

なし

## 実装者への申し送り

- 前回 High 指摘の保存先問題は、`task.md:11`、`task.md:23`、`task.md:44`、`task.md:108-113` で `impl.md` / `eval.md` / `acceptance/` / `artifacts/` に確定されている。今後の実施ログやスクリーンショット、snapshot は task.md へ追記せず、指定先へ残すこと。
- 前回 High 指摘の「複数 VRM」「破綻が許容範囲」「viewport で崩れない」の期待値は、`task.md:70-81`、`task.md:93-106` で最小ブラウザ、URL、viewport、VRM 数、NG 条件まで具体化されている。2 体目の VRM を用意できない場合は PASS にしない条件も明示済み。
- 前回 Medium 指摘の `motion-debug` 手順不足は、`task.md:143-157` で `/motion-debug/` の desktop / mobile resize と `window.__SINCRO_MOTION_DEBUG__.startCamera()` / `waitForPoseDetected()` / `getSnapshot()` の確認に更新されている。API は `sincromisor-frontend/src/pages/motionDebug/types.ts:35-40` と `sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:271-281` に存在する。
- 前回 Medium 指摘の手編集候補の曖昧さは、`task.md:46-64` で「手編集候補」と「参照・生成・確認対象」に分離されている。`tasks/character-sincro-motion/index.md` は記載どおり `npm run tasks:index` 生成物として扱うこと。
- 設計同期先の `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` は、`motion-debug` と IK / tracker 観測の正本として現行設計に存在する。仕様差分が出た場合だけ同期し、差分なしの場合も `impl.md` または `eval.md` に「追記不要」と判断理由を残すこと。
- `task.md:166-202` には過去の実施ログと未完了項目が残っているが、現行仕様は `task.md:44` のとおり review 後固定で、追加ログは `impl.md` / `eval.md` 側へ記録する前提で進めること。
