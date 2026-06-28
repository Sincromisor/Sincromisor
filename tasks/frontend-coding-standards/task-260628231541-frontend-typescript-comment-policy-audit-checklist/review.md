# Review: task-260628231541-frontend-typescript-comment-policy-audit-checklist

## 判定
APPROVED

Blocking となる Critical / High はない。受け入れ条件は対象ファイル、追加する規約内容、同期先、スコープ外、検証コマンドまで具体化されており、実装者の設計判断で成果物が変わる未確定事項は残っていない。

## 指摘事項
なし

## 実装者への申し送り
- `documents/rules/coding-ts.md` は現状 `## 12. その他の負債抑制ルール` までなので、task.md どおり `## 13. ソースコードコメント品質` を末尾追加すれば既存節番号を揺らさず実装できる。
- `documents/rules/coding-ts.md:54`、`:133`、`:152` はそれぞれ該当節の入口で、実際の catch / TODO / コメント言語ルールは同節内の近接行にある。編集時は節単位の文脈を確認すること。
- `tasks/AUTHORING-CHECKLIST.md` は task-reviewer 評価観点の正本なので、TypeScript production code 変更タスクに comment audit / comment acceptance を受け入れ条件として要求する、というレビュー基準まで読み取れる書き方にする。
- `AGENTS.md` のコメント方針を弱めず、詳細正本を `documents/rules/coding-ts.md` の新節へ誘導する。JSDoc / TSDoc、失敗条件、副作用、TODO 必須情報、stale comment 更新、命名・分割・型による明確化の方針は維持する。
- `documents/rules/code-structure.md:30` の「コメントで段落分けしたくなったら関数抽出を検討する」方針と矛盾しないよう、コメントは責務分割の代替ではなく、境界と理由を伝える補助だと明記する。
