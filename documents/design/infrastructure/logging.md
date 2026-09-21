# インフラ: ログの保存と検索

## 要約

- 中央保存はVictoriaLogs単一ノードとし、標準の`full`または中央専用の`logs`プロファイルで起動する。
- `compose/logging.yml`が保存先、保持期間、公開先と死活確認の正本である。
- 共通項目を持つJSONLで投入・検索する。各ホストのVector収集と内容の記録切替は後続タスクで実装する。

## 起動と配置

配布設定の`full,chat`では通常の`docker compose up -d`に中央保存も含まれる。
業務サービスは中央の起動・正常性を待たない。分散配置では中央を置く1台だけで`full`または`logs`を選ぶ。
`logs`単独は既存Consulサーバーへ参加するため、`SINCRO_CONSUL_SERVER_HOST`を設定する。

VictoriaLogs v1.52.0の公式イメージをダイジェストで固定し、HTTP確認用のBusyBoxだけを追加する。
`/busybox wget -q -O /dev/null http://127.0.0.1:9428/health`の成功をDockerの正常状態とする。
`SINCRO_LOG_RETENTION`は既定`7d`で、起動引数の`-retentionPeriod`へ渡す。変更は再作成で反映する。

検索・投入の内部待受は9428、既定のホスト公開は`127.0.0.1:9428`に限る。
`compose/distributed.yml`を選ぶ場合だけ管理IPv4の9428も公開し、そのIPをConsulへ広告する。
管理ネットワークのファイアウォールで参加ホストに制限する。9428は投入専用ではなく検索APIも含む。
非信頼ネットワーク越しには管理VPNまたは認証付きTLS終端を設け、直接公開しない。

## 保存と限界

`victoria-logs-data`名前付きボリュームを`/victoria-logs-data`へ割り当てる。
JSONLは入出力の形式であり、内部はVictoriaLogs専用の圧縮・索引付き保存形式となる。
再作成時も同じボリュームを使う。既存領域の削除や`down -v`を復旧手段にしない。

保持期間外のログは投入時に破棄され、保存済みの日単位の領域も期限に応じて削除される。
保持期間は容量上限ではない。ディスク空き容量を別に監視し、必要なログは期限前に検索APIから退避する。
単一ノード停止中は投入・検索できず、ディスク故障時の複製もない。収集側の永続バッファは中央保存のバックアップではない。

## Consul登録と監視

`consul-agent-logs`が`SincroLogs`、ID `SincroLogs_<SINCRO_LOG_HOST>`として登録する。
`SINCRO_LOG_HOST`は単一ホストで`local`、複数ホストでは一意の英数字・`_`・`.`・`-`を設定する。
エージェントのLAN gossipはTCP/UDP 8321、HTTP 8500とDNS 8600は内部専用である。
登録は設定ファイルで保持し、10秒間隔・5秒時間切れの`/health`確認を行う。
中央停止時はcritical、復旧後はpassingとなり、停止中も登録を消さない。
エージェントからサーバーへの状態同期が失敗した場合はConsulの再同期まで反映が遅れるため、ローカルの`/v1/agent/checks`とクラスタの`/v1/health/checks/SincroLogs`を区別する。

単一ホストの広告先は`SINCRO_LOG_PUBLIC_HOST=victoria-logs`である。
ConsulはDocker DNS `127.0.0.11`へ再帰問い合わせを行い、コンテナ再作成後のIPをDNS応答へ反映する。
分散用Composeでは広告先を`SINCRO_CONSUL_PUBLISH_HOST`の管理IPv4へ置き換える。
広告先の変更はエージェントの再作成で反映する。ローカル死活確認は内部のサービス名を使う。
bandogは`SincroLogs.service.consul`のDNS応答も必須監視する。実際の投入成功は別途確認する。

## 共通ログ項目

自前サービスは標準出力・標準エラーへ1イベント1行のJSONを出力し、収集側が第三者のテキストも同じ項目へ揃える。

| 項目                                                   | 意味                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `timestamp`                                            | 発生時刻。UTCのRFC 3339。不明な場合はDocker記録時刻  |
| `observed_at`                                          | 収集時刻。UTCのRFC 3339                              |
| `host`                                                 | 明示設定したホスト識別子。コンテナhostnameを使わない |
| `project`, `service`                                   | Composeラベルから取得する配置とサービス              |
| `container_id`, `stream`                               | Dockerの識別子とstdout / stderr                      |
| `level`, `event`, `message`                            | 重大度、イベント識別子、人が読む説明                 |
| `session_id`, `speech_id`, `sequence_id`, `message_id` | 処理が実際に保持する会話識別子                       |

取得できない任意項目は推測で補わない。既存RTC・msgpack契約は変更しない。
投入URLの`_time_field=timestamp`、`_msg_field=message`、`_stream_fields=host,project,service`を使う。
会話IDはストリーム識別子へ加えず、通常の検索項目にする。数値も検索APIのJSONLでは文字列になる。

## 内容の記録切替の契約

以下は後続実装の共通契約であり、現段階で未実装の設定を配布用環境変数へ追加しない。

| 設定                              | 既定値 | 対象                                                   |
| --------------------------------- | ------ | ------------------------------------------------------ |
| `SINCRO_LOG_CONVERSATION_ENABLED` | `true` | 音声認識・利用者入力・応答の本文                       |
| `SINCRO_LOG_SYNTHESIS_ENABLED`    | `true` | 読み上げ本文、話者・生成条件、キャッシュ結果、処理時間 |

未指定は有効、指定値は`true` / `false`のみとし、空文字・不正値はキーを示して起動時に拒否する。
設定は独立し、本文を両経路で止めるには両方を無効にする。対象コンテナ再作成で反映する。
自前サービスは出力元で止め、一般の稼働・失敗・状態変化ログは残す。
例外、要求全体、URLなどを経由して本文を迂回出力しない。認証トークン・秘密鍵は常に記録しない。
第三者は公式設定を優先し、止められないものはVectorで除去する。その場合Docker原本に残る範囲を明記する。
設定変更は保存済みログ、Mastraの機能用会話履歴、認識用の音声・結果保存、Redis・S3の音声キャッシュを削除しない。
音声バイナリをJSONLへ埋め込まない。

## 人工ログの投入と検索

実際の対話や秘密を含まない確認データを使う。

```sh
jq -nc --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{timestamp:$now,host:"fixture",project:"fixture",service:"fixture",message:"日本語の確認",sequence_id:7}' \
  | curl --fail -H 'Content-Type: application/stream+json' --data-binary @- \
    'http://127.0.0.1:9428/insert/jsonline?_time_field=timestamp&_msg_field=message&_stream_fields=host,project,service'
curl --fail --data-urlencode 'query=_time:1h host:fixture service:fixture' \
  http://127.0.0.1:9428/select/logsql/query | jq '{時刻:._time,本文:._msg,連番:.sequence_id}'
```

検索画面は`http://127.0.0.1:9428/select/vmui/`である。
確認用の隔離Composeは`node --test scripts/tests/logging-foundation.test.mjs`で実行する。
先に`docker compose --env-file examples/compose.env -f compose.yml build victoria-logs`でイメージを作る。
設定・公開先を変える際は標準構成と分散用Compose、Consul登録、bandog、保存領域を同時確認する。

## 参照

2026-09-22に公式の[起動手順](https://docs.victoriametrics.com/victorialogs/quickstart/)、
[保持期間と保存](https://docs.victoriametrics.com/victorialogs/#retention)、
[VectorのJSONL投入](https://docs.victoriametrics.com/victorialogs/data-ingestion/vector/)を確認した。
