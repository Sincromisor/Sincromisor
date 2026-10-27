# Vectorのヘルスチェックによるゾンビプロセス蓄積を防ぐ

## 背景と目的

ユーザーの調査報告では、VectorがPID 1で動く収集コンテナに、ヘルスチェック由来と考えられる終了済み子プロセスが蓄積している。現行コードもinitなしで`timeout 10 bash /check-vector.sh`からjournalを確認している。過去の各ゾンビが時間切れで発生したことは未確定であり、確認済みの構成と推定経路を区別する。

## 完了条件

- [x] Vectorに`init: true`を設定し、孤児プロセスを回収できる。
- [x] journal確認は必要な1件だけで終わり、子プロセスの失敗を正常と判定しない。確定カーソル消失の記録を維持する。
- [x] ヘルスチェックと起動前確認の時間切れはTERM後の強制終了まで制限し、Docker側の強制終了より先に処理を終える。
- [x] 対象テスト、Compose構成検査、隔離コンテナでの時間切れ・回収確認が通る。
- [x] 設計と反映手順を同期し、実環境への適用可否を記録する。

## 変更範囲と方針

`compose/log-collector.yml`、`Docker/logging/{check-vector,check-journal-cursor,start-vector}.sh`と対象テストを変更する。`vector-data`、入力名、カーソル・欠落記録の形式、収集範囲は維持する。タイムアウトと回収は既存のGNU timeoutとDocker initに委ねる。

`documents/design/infrastructure/logging.md`へ現在仕様を反映する。既存コンテナへは再作成が必要であり、起動済み対象を確認できる場合だけサービスを限定して反映する。接続先に対象がなければ、既存ゾンビの解消や実journalでの性能改善を確認済みとは扱わず、適用手順を残す。

## 確認方法

正常・カーソル不一致・journalctl失敗・時間切れを人工入力で確認し、異常時の記録と非公開本文を出さないことを検査する。既存Vectorイメージを再利用した専用コンテナで、時間切れ後の子プロセス終了とinitによる回収を確認する。通常構成と配布サンプルは`docker compose config --quiet`で検査する。新規イメージやボリュームは作らない。

## 確認結果

- `VECTOR_TEST_IMAGE=sincromisor-update/vector:20261025-a29a6ea2 node --test scripts/tests/vector-healthcheck.test.mjs scripts/tests/log-healthchecks.test.mjs`: 4件PASS。正常・部分一致拒否・空出力・非ゼロ終了・欠落記録維持、TERMとKILL後のプロセス不在、実journalの末尾以外のカーソルを確認した。
- `bash -n`で変更した3本のシェルスクリプトを確認した。
- 通常構成と`--env-file examples/compose.env -f compose.yml`の`docker compose config --quiet`: PASS。
- 対象JavaScriptのBiome、変更MarkdownのPrettier、タスク状態・索引検査、差分検査: PASS。
- 設計索引から既存のログ設計へ辿れることを確認し、時間制限・回収・反映手順を同期した。コメント点検: PASS。
- Docker接続先は`default`。既存イメージ`86c8e1b87106`を再利用し、追加取得・ビルド・ボリューム作成はない。検証コンテナは`--rm`、保存領域はtmpfsとし、検証後のコンテナ残存がないことを確認した。

接続先には報告対象のコンテナが存在しなかったため、実環境での再作成、既存19個の解消、ホストjournalでの所要時間比較は未実施である。反映手順は[ログ設計](../../../documents/design/infrastructure/logging.md#ホストのjournal)、実装上の判断は[実装記録](impl.md)を参照する。
