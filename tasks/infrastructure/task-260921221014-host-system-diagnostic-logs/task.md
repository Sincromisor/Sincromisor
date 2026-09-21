# ホストのDocker・システム・カーネル障害を収集する

## 背景と目的

Docker内の標準出力だけでは、Dockerデーモン停止やホストのOOM・GPU・ディスク障害によるサービス停止を説明できない。
[棚卸し](../task-260921221013-logging-coverage-inventory/task.md)に従い、Sincromisorの実行ホストの障害記録を各ホストのVectorへ取り込む。

## 変更範囲と方針

- リポジトリのLinux Dockerホストを基準とし、ホストのjournald/syslog等の既存記録からDocker・コンテナ実行基盤、サービス管理、カーネルのOOM・GPU/デバイス・ディスク・ネットワーク障害を収集する。
- Vectorの既存入力を優先し、journalの読取位置と必要な読取権限・読取専用マウントを保持する。コンテナ内のログをホストログと取り違えない。
- 収集設定は標準Composeへ含め、`docker compose up`で起動する。実際のホスト記録先を読めない場合はConsulの収集状態と起動診断へ明示し、空入力を正常と見なさない。本体を停止させない。
- ホストの記録保存・アクセス権などCompose単体では成立しない前提は、既存の導入設定とサンプルへ反映する。秘密を含むホスト全体の環境や無関係な他アプリの本文は収集しない。
- host、boot識別、unit/実行元、重大度、発生時刻を保持し、サービスを特定できないカーネル障害に架空の業務サービス名を付けない。
- 診断内の秘密除去とサイズ上限を設け、中央停止中もローカル原本を保持する。再開位置・ローテーションの確認は[回収タスク](../task-260921221014-logging-delivery-recovery/task.md)と合わせる。

## 完了条件

- [x] Dockerデーモン/サービス管理とカーネル障害の記録を、ホスト・発生元・時刻付きで中央から抽出できる。
- [x] 読取り権限不足・記録先欠落を検知し、Consul監視と診断に反映する。不要な全面特権を要求しない。
- [x] 収集コンテナ再作成で読取位置が維持され、残存ログを再開できる。標準起動へ含まれる。
- [x] 棚卸しの対象ホストごとに利用する原本と取得可能な診断範囲を記録する。

## 確認方法と同期

Dockerホストの実際の読取経路で無害な試験メッセージを収集する。OOM・GPU障害は既存形式に沿う固定入力で解析を確認し、ホストを故障させない。
実原本へのアクセス確認と固定入力だけの確認を区別して記録する。
`compose.yml`、ログ収集定義、`examples/compose.env`、`documents/design/infrastructure/logging.md`と必要な導入手順を同期する。
別OSへの新規対応や常時全システムログ収集は追加しないが、配置済みホストの未収集を暗黙の対象外にはしない。

## 実装と確認結果（2026-09-22）

Vectorのnative `journald` 入力を標準収集Composeへ追加した。永続/実行中journalの読取専用マウント、過去bootとホストmachine-idの読取、`vector-data/host_journal/checkpoint.txt` による再開を使う。Docker/containerd・systemd・カーネルの既知障害を固定分類に変え、原文・環境・任意の処理名を中央へ出さない。journal解析失敗をVector自身が記録する場合も原文を固定イベントへ置換する。

公式Vector 0.58.0 Debianイメージのjournalctl 257では `current_boot_only=false` が実起動時に拒否された。このためVector固定版バイナリとUbuntu 26.04のjournalctl 259.5を組み合わせた最小配布イメージを追加した。独自のjournal読取器は実装していない。Docker healthcheckでHTTP生存・実原本のカーソル・native追尾プロセスを確認し、既存observerを通じてConsulの収集/監視状態へ反映する。

| 範囲          | 入力・構成・検索と結果                                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H02・実読取   | ローカルLinux/WSLの実 `/var/log/journal` と `/run/log/journal` を専用 `host-logs-fixture` へ読取専用で渡した。ホストから `logger -t sincromisor-log-test` で固定形式とUUIDを投入し、`event:host_diagnostic probe_id:<UUID>` で中央1件。host・boot・発生時刻を保持しserviceはない。Dockerの実原本も `origin:docker` の固定状態/失敗分類で検索可能 |
| H03・固定入力 | OOM、NVRM Xid、Buffer I/O error、NETDEV WATCHDOGの人工原本4件を本番と同じ変換へ渡し、専用Vector→同居ルーター→中央で `host:host-fixed-fixture event:host_diagnostic` を検索。4分類各1件、人工本文/資格情報/デバイス名はなし。実OOM/GPU/ディスク障害を起こした確認ではない                                                                         |
| 読取異常      | 空ディレクトリへの差替え、および読取拒否ディレクトリと非root収集を専用構成で確認。固定理由 `journal_unreadable_or_missing` とConsulの `SincroLogCollector` / `SincroLogObserver` criticalを確認。原本復帰後は両方passing                                                                                                                         |
| L09・再開     | 同じvector-dataを維持して停止し、その間に実journalへ無害な2件目を投入してVectorを再作成。最初と2件目が各1件で、投入2・抽出2・重複0・欠落0。cursorファイルの存在を確認                                                                                                                                                                            |
| 標準起動      | `docker compose --env-file examples/compose.env config` で既定プロファイルに配布ビルド・読取専用原本を含むことを確認。既定の全業務サービス起動は最終結合確認の対象                                                                                                                                                                               |

Vectorの固定入力9テスト、observerの既存/追加Goテストとvet、healthcheckのBash構文、対象Biome・Prettier、差分検査を確認した。README・Compose設計・ログ設計・環境サンプルを同期し、変更した入力/変換、監視状態とその直接理解範囲のコメントを点検した。独立評価はコミット済みの実装に対して実施する。

今回アクセス可能な実ホストはローカルLinux/WSLだけである。他ホストの原本を確認済みとは扱わず、二ホスト構成での配置・権限・障害到達は最終結合確認に残す。原本のローテーション・保持超過・回収不能区間の検知は後続の配送/復旧タスクが担当する。未加工journalや運用本文は成果物へ保存せず、Git外の検証記録には試験IDの検索結果と安全な固定分類だけを残した。
