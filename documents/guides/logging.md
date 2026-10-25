# ログの準備と検索

## 目的と前提

サーバーを管理する人が、ログを準備し、会話の不調を調べ、必要な記録を保存するためのガイドである。
通常の `full,chat` 構成では中央保存と各ホストの収集が起動する。以下のComposeコマンドは、対象サーバーのリポジトリルートで実行する。
分散配置では、そのホストで使っている `.env`・Composeファイル・プロファイルを維持する。
設定の定義は [設定例](../../examples/compose.env) と [ログ配置](../../compose/logging.yml)、収集の仕組みは [ログ基盤設計](../design/infrastructure/logging.md) を参照する。

## 起動前にjournalを準備する

Linuxの各収集ホストで、管理者がsystemd-journaldの永続保存を有効にする。これはSincromisorだけでなくホスト全体のログ保存に影響する。
既存の設定とディスク空き容量を確認し、`/etc/systemd/journald.conf.d/sincromisor.conf` の `[Journal]` に `Storage=persistent` を設定する。
`SystemMaxUse` と `RuntimeMaxUse` は、そのホストの容量と必要な保存期間に合わせて決める。既存の保存条件を無断で置き換えない。
設定後、同じホストの端末で管理者権限を使って反映する。

```sh
sudo systemctl restart systemd-journald
sudo journalctl --flush
sudo journalctl --disk-usage
```

収集は `/var/log/journal` と `/run/log/journal` を読み取る。保存場所が異なる場合は、ルート `.env` の `SINCRO_LOG_JOURNAL_DIR` と `SINCRO_LOG_RUNTIME_JOURNAL_DIR` を合わせる。
収集コンテナはrootで読み取るが、利用者名前空間などで拒否される場合は管理者がjournal読取グループやACLで必要な読取権限だけを与える。原本全体の所有者やモードを変更しない。
初回はこの準備の後にREADMEの起動操作へ進む。起動済みでマウント先を変更した場合は `docker compose up -d --no-deps vector` で再作成する。

## 検索画面を開く

中央ログを動かすPCのブラウザーで [ログ検索画面](http://127.0.0.1:9428/select/vmui/) を開く。
既定の公開先はそのPC自身だけである。別PCで `localhost` や `127.0.0.1` を開いても中央ログには接続できない。
一般利用者向けの画面公開に合わせて、この管理画面を外部へ公開しない。

検索欄に次のLogsQLを入力して実行する。期間はまず直近1時間とし、見つからなければ広げる。
画面側でも期間を指定する場合は、調べたい時刻を含める。

| 調べたいこと        | 検索例                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| 直近1時間           | `_time:1h`                                                                    |
| 音声認識            | `_time:1h service:="speech-recognizer"`                                       |
| エラー              | `_time:1h level:="error"`                                                     |
| 特定の会話          | `_time:1h session_id:="example-session"`                                      |
| 同じ会話のRTCエラー | `_time:1h service:="sincro-rtc" level:="error" session_id:="example-session"` |

`example-session` は架空の値である。実際の調査では見つけたログの `session_id` に置き換える。
会話IDを持たない起動前の失敗は、期間・サービスで探す。分散配置では `host:="rtc-example"` のように設定済みのホスト識別子も加える。
ログの時刻はUTCで記録されるため、表示時刻と調査時刻のタイムゾーンを確認する。

## 内容の記録を切り替える

対話本文と音声生成の詳細は、どちらも既定で有効である。対象サーバーのルート `.env` を編集する。

| 設定                              | 記録する内容                                           | 再作成するサービス                                                                                             |
| --------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `SINCRO_LOG_CONVERSATION_ENABLED` | 音声認識、利用者入力、応答の本文                       | `speech-extractor`、`speech-recognizer`、`text-processor`、`voice-synthesizer`、`agent-server`、`llama-server` |
| `SINCRO_LOG_SYNTHESIS_ENABLED`    | 読み上げ本文、話者・生成条件、キャッシュ結果、処理時間 | `voice-synthesizer`、`vector`                                                                                  |

両方の経路で本文を止める例は次のとおり。値は `true` または `false` とし、空欄にしない。

```dotenv
SINCRO_LOG_CONVERSATION_ENABLED=false
SINCRO_LOG_SYNTHESIS_ENABLED=false
```

会話を終えてから、変更した設定を受け取るサービスを再作成する。通常の `full,chat` 構成で両方を変更した場合は次を実行する。

```sh
docker compose up -d --no-deps speech-extractor speech-recognizer text-processor voice-synthesizer agent-server llama-server vector
```

片方だけ変更した場合は表の対象だけを指定する。分散配置では各ホストの設定を揃え、そのホストに配置した対象だけを再作成する。`restart` だけでは環境変数の変更は反映されない。
変更後の短い確認会話を期間で絞り、本文の有無と通常の処理・失敗ログが残ることを確認する。確認内容にも秘密を使わない。

停止しても保存済みログ、Mastraの会話履歴、認識音声・結果の保存、Redis・S3の音声キャッシュは消えない。
音声生成の記録を止めても、VOICEVOXの要求URLはDockerのjournal原本に残り得る。中央では除去されるが、原本の保持期限・容量による削除までは管理者が読める。
LLMやVOICEVOX内部の詳細診断も減るため、コンテナの状態や周辺サービスの処理結果と合わせて調べる。

## ログが見つからないとき

1. 中央ホストで `docker compose ps victoria-logs` を確認する。検索画面が開かない場合は、中央を起動する `full` または `logs` プロファイルとURLを確認する。
2. 検索期間を広げ、会話IDや重大度の条件を外す。過去ログは、現在の記録設定を変えても復元されない。
3. 出力元ホストで `docker compose ps vector log-observer log-router` と `docker compose logs --tail 100 vector log-observer log-router` を確認する。共有前に本文や秘密の混入を確認する。
4. journalの存在・読取権限・空き容量、中央への到達性を確認する。分散配置では一意の `SINCRO_LOG_HOST`、Consulの収集・転送・中央のチェックも確認する。

中央の保持期間は `.env` の `SINCRO_LOG_RETENTION` で指定し、既定は `7d` である。変更後は中央の `docker compose up -d --no-deps victoria-logs` で反映する。
期限外のログは投入時にも破棄される。保持期間は容量上限ではないため、中央と各ホストのディスク空き容量を別に監視する。
必要な記録は期限前に退避する。

## 停止中のログを回収する

中央が停止している間は、各ホストのjournalとVectorの送信待ち領域がログを保持する。
中央と収集サービスの復旧後、残っている原本を確定済みの読取位置から自動回収する。停止中の時刻で検索し、回収できた範囲を確認する。
journalの容量制限・レート制限、Dockerの非同期バッファ満杯、原本の消失による欠落は回収できず、再送による重複もあり得る。

`logging_loss_unknown`、`logging_discarded`、`logging_recovery`、`logging_delivery` を検索し、欠落の可能性と配送の回復を調べる。
原本cursor消失で監視が異常のままなら、まず不明区間を記録し、原本を戻せる場合は戻す。
その後、管理者が確認済みのmarkerだけを解除する。

```sh
docker compose exec vector rm /var/lib/vector/journal-gap.json
```

これは欠落検知の印の解除であり、失われたログの復元ではない。中央の診断履歴は残る。
`vector-data`、読取位置、journalを消して復旧を試みない。保持・回収の限界は [ログ基盤設計](../design/infrastructure/logging.md#原本バッファ復旧) を参照する。

## バックアップと復元確認

中央ホストのリポジトリルートで実行する。事前に中央ボリューム外の保存先ディレクトリを用意し、空き容量と管理者だけが読み書きできる権限を確認する。
次のスクリプトは中央だけを一時停止し、ファイル一式を保存して、実行前に稼働していた中央を再起動する。停止中は検索・投入できない。
既存の同名ファイルは上書きしない。分散配置では `-f` を含む引数を、中央ホストで利用する構成一式に合わせる。

```sh
sh scripts/logging/backup.sh /backup/sincromisor-logs.tar --env-file .env -f compose.yml
```

失敗時も元の稼働状態への復帰を試みるため、終了コードと `docker compose ps victoria-logs` を確認する。
ホスト故障にも備える場合は、会話を含み得るバックアップを管理者用の転送路で別ホストへ保存する。

復元確認には未使用の名前付きボリュームとコンテナ名を使う。次の名前が存在しないことを事前に確認し、存在する場合は別名に変える。
管理下にあるバックアップ元と同じバージョンの中央イメージを使い、レジストリを変更している場合はイメージ名も合わせる。

```sh
docker volume inspect logs-restore-data
docker container inspect logs-restore-check
```

両方とも存在しないことを確認してから、中央ホストで実行する。

```sh
docker volume create logs-restore-data
docker run --rm -i --network none -v logs-restore-data:/restore \
  --entrypoint /busybox ghcr.io/sincromisor/victoria-logs:v1.53.0 \
  tar -C /restore -xf - < /backup/sincromisor-logs.tar
docker run -d --name logs-restore-check --network none \
  -v logs-restore-data:/victoria-logs-data \
  ghcr.io/sincromisor/victoria-logs:v1.53.0 \
  -storageDataPath=/victoria-logs-data -retentionPeriod=7d
docker exec logs-restore-check /busybox wget -qO- \
  'http://127.0.0.1:9428/select/logsql/query?query=*&limit=10'
```

復元確認の保持期間も保存したいログの時刻を含む値へ合わせる。古いバックアップに短い保持期間を使うと、確認用コピーから期限外データが削除される。
検索結果は非公開で扱う。確認後は `docker stop logs-restore-check` で確認用コンテナを停止し、確認用コピーの保管・削除は管理者が判断する。
稼働中の中央ボリュームは上書きしない。本番への切替は検索確認後に管理者が停止時間と対象を決めて行う。
バックアップ以降に中央だけへ受理されたログは復元できない可能性があり、Vectorが受理済みログを必ず再送するわけではない。その区間を復元記録へ残す。
