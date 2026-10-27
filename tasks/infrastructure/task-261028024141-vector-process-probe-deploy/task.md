# Vectorのプロセス探索を軽量化する

## 目的と範囲

Vectorのヘルスチェックは`/proc`の各候補でcatを起動し、journalctlの引数確認にもtr・grepを使っている。この探索をBashのread組み込みへ置き換え、既存のinit・GNU timeoutによる終了処理を維持する。

変更対象は`Docker/logging/check-vector.sh`、対象テスト、ログ設計とタスク記録とする。接続先・実配備情報・診断原本は非公開台帳とGit管理外の作業領域だけに記録する。既存の未コミットデータを変更しない。

## 完了条件

- [x] プロセスごとの外部コマンド起動をなくし、journalctlの独立した`--follow`引数だけを正常と判定する。探索中のプロセス終了を異常終了にしない。
- [x] 正常な追尾、追尾なし、終了後の不在を対象テストで確認し、既存のカーソル・終了処理試験が通る。

## 確認方法

対象のシェル構文、Compose構成、JavaScript・Markdown整形と、既存Vectorイメージを使う隔離テストを行う。実装を独立確認する。会話経路・通信契約は変更しないため音声会話の再試験は行わない。

## 確認結果

- 既存配布イメージで`node --test scripts/tests/vector-healthcheck.test.mjs`: 3件PASS。実Vector・人工journalの生存確認、追尾の有無と独立引数、カーソル判定、TERM/KILL後の回収を確認した。
- 変更したシェルの`bash -n`、通常構成・配布サンプルの`docker compose config --quiet`、対象JavaScriptのBiome、変更MarkdownのPrettier: PASS。
- [独立レビュー](review.md): APPROVED。[独立評価](eval.md): 実装確認はPASS。設計同期とコメント点検: PASS。

[実装記録](impl.md)に実装判断と未実施事項を記録した。音声会話の再試験、中央への新着配送、日単位の連続稼働は今回確認していない。
