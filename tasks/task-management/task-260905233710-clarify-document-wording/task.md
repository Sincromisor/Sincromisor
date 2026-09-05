# タスク運用と文書ガイドの過剰な用語を整理する

## 目的

利用者から指摘された「正本」の過剰使用を見直し、手順・仕様・規約・参照先を文脈に合う表現で説明する。

## 変更範囲

- `tasks/README.md` と `tasks/AUTHORING-CHECKLIST.md`。
- `documents/rules/` の6文書と、設計文書の運用ガイド・索引・現在設計テンプレート。
- 状態の管理元、設定の定義元、生成元を区別する記述は維持する。
- 過去のタスク記録・保管文書、本番コード、既存の未コミット変更は対象外とする。

## 完了条件

- [x] `tasks/README.md` の冒頭を利用者の提案どおり「運用手順である」にする。
- [x] 案内表現を整理し、文書作成規約に用語の使い分けを記載する。
- [x] 参照先、管理元、規約の適用関係を維持する。
- [x] 変更したMarkdownの整形とタスク管理の整合性を確認し、今回の変更による不整合がない。

## 確認方法

`rg -n '正本' tasks/README.md documents/rules documents/design/documentation-guide.md documents/design/index.md documents/design/templates/current-design.md tasks/AUTHORING-CHECKLIST.md` で用例を抽出し、差分を目視確認する。変更文書をPrettierで整形し、`tasks:index:check` と `tasks:check` を実行する。

## 確認結果

- `tasks/README.md` の用例は12箇所から3箇所へ削減。残したのは状態、ブランチ接頭辞、エージェント手順の管理元を明示する記述。
- 文書表現のみの変更であり、本番コードのテストとコメント点検は対象外。
- Prettier、`git diff --check`、`tasks:index:check` は成功。
- `tasks:check` は既存タスク `task-260904005741-fix-face-landmarker-timestamp` の `review.md`、`impl.md`、`eval.md` 欠落3件で失敗。今回のタスクに関する指摘はなく、変更前のGitツリーでも3ファイルが存在しないことを確認した。
