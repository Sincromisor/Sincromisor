# Review: task-260628200308-character-animation-3-0-phase-12-code-structure-guard

## 判定
APPROVED

High/Critical の blocking 指摘はない。受け入れ条件は script の対象、strict / inventory の分界、exit code、例外コメント、文書同期まで検証可能に定義されている。

## 指摘事項
- [Medium] `file:line` 参照に複数のズレがある。`tasks/README.md:157` は scripts 表ではなく `review.md` の役割行で、scripts 表は現状 `tasks/README.md:210` 以降。`documents/rules/code-structure.md:24` は「1 ファイル = 1 主要 export」で、UI / 外部 I/O / 純粋計算の混在は `documents/rules/code-structure.md:20` と `documents/rules/code-structure.md:32` 以降。実装対象は特定できるため blocking ではないが、実装者は現行行番号で確認すること。

## 実装者への申し送り
- 例外コメントは task.md 指定どおり `// reason: structure-threshold-exception <理由>` に固定し、既存の汎用 `// reason:` ルールへ追記する。
- `git diff main --name-only -- sincromisor-frontend/src` が失敗する環境では exit 1 にせず、strict 対象空・inventory のみで deterministic に出力する挙動を必ず確認する。
- fixture / temp file を使った 301 行 strict failure と例外コメント warning の確認結果は、実装ログに残すのが望ましい。
