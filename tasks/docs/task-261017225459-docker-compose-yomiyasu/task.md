# Docker Compose管理ルールの日本語を推敲する

## 背景と目的

ユーザーの依頼に従い、今回作成したDocker Compose管理ルールに `yomiyasu`スキルを適用する。名詞を詰め込んだ表現や主語・対象が分かりにくい文を直し、ルールの条件と強さを保つ。

## 完了条件

- [x] 管理ルールと今回の関連文書を読み、必要な箇所を推敲する。
- [x] 削除許可、容量不足時の停止、保持・後片付けの義務、技術上の条件を変えない。
- [x] スキル付属のlint・diff検査を実行し、原文と最終稿を読み比べる。
- [x] 検査した最終稿を反映し、verifyで一致を確認する。

## 変更内容

[管理ルール](../../../documents/rules/docker-compose.md)と[容量管理ルールのタスク記録](../task-261017225122-docker-image-disk-management/task.md)を推敲した。`AGENTS.md`の参照行と初回作成時のタスク記録も読み、今回は変更を加えなかった。

- 「ビルド増加量」を「ビルドで増えた容量」にするなど、名詞の連続を助詞と動詞でほどいた。
- 後片付けの担当がビルド・取得を行うエージェントであることと、各プロファイルで選ぶ対象が起動対象であることを明記した。
- 構文確認と一覧確認の文を分け、操作と出力の対応を明確にした。
- 既存仕様や保持ルールを指す「契約」、作業記録を指す「台帳」を文脈に合う語へ直した。

## 確認の記録

- 書き手は決めていない。読み手はエージェントと開発者（文脈から推定）。管理ルールはmanual・決まり、タスク記録はpr・説明として検査した。読者の知識はexpertと推定した。
- 実行した検査は原文のlint、最終稿のlintとdiff、最終稿の照合。未実行のスキル検査はない。
- lintの見直し候補は管理ルールが原文3件から最終稿0件、タスク記録が原文0件から最終稿0件。件数は点数ではなく、増減は読みやすさの良し悪しを示さない。
- 最終稿の硬化・勢いの検査は両文書とも候補なし。diffの候補は管理ルール4件、タスク記録2件で、名詞を動詞へ直したことによる語・条件表現・文数の変化だった。原文と読み比べ、情報や条件を追加・削除していないことを確認した。
- 数値、コマンド、設定キー、URLを保持し、削除許可と容量不足時の停止、保持条件も維持した。

```text
yomiyasu-check: executed via=verify run=20261017T135552Z-08657296 attempt=1 final=sha256:3395580850d8 mode=rewrite doc_type=manual reader=expert checks=lint,diff meaning_risk=0 replay=skipped
yomiyasu-check: executed via=verify run=20261017T135552Z-f9f3765f attempt=2 final=sha256:e7160de17881 mode=rewrite doc_type=pr reader=expert checks=lint,diff meaning_risk=0 replay=skipped
```

検査記録と原文・最終稿の写しは `/tmp/sincromisor-yomiyasu.dzdkSS/`に保存した。検査の実行とハッシュの一致は、意味や読みやすさの合格を保証するものではない。

変更MarkdownのPrettier、相対リンク12件、コード表記・数値・リンクの保持、`git diff --check`、`tasks:index:check`、`tasks:check`はPASS（555タスク）。文書の推敲のみのため、Dockerの操作は実行していない。
