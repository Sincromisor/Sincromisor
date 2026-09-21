# インフラ: ログの保存と検索

## 要約

- 中央保存はVictoriaLogs単一ノードとし、標準の`full`または中央専用の`logs`プロファイルで起動する。
- `compose/logging.yml`が保存先、保持期間、公開先と死活確認の正本である。
- 共通項目を持つJSONLで投入・検索する。各ホストのVectorが収集・送信する。Pythonの対話内容は出力元で記録を切り替える。

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

Python4サービスは対話設定を受け取り、認識・対話ワーカーが出力元で制御する。音声生成設定はVoiceSynthesizerとVectorへ渡す。

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

## 各ホストの収集

`compose/log-collector.yml`を標準includeし、既存の`full` / `backend` / `external` / `rtc` / `frontend` / `chat` / `s3`と中央用`logs`へVector・Caddy・Consulエージェントを同梱する。
同じホストの担当プロファイルを複数指定しても各1インスタンスである。`COMPOSE_PROJECT_NAME`をVectorへ渡し、そのComposeプロジェクトのラベルだけを収集する。
ホストごとの`SINCRO_LOG_HOST`は管理者が一意に設定する。ホスト間で時刻を同期し、発生時刻と収集時刻を区別する。

Vector 0.58.0のDocker入力は新規・再作成後のコンテナも追跡する。
RTC、フロントCaddy、音声処理、AgentServer、llama-server、VOICEVOX、Redis、SeaweedFS、Consul、bandog、初期化コンテナをサービス名の除外なしで対象にする。
任意選択のMediaMTX・旧MinIOも同じプロジェクトなら対象である。
Vector自身はDocker入力の自己除外と`internal_logs`入力を使い、標準出力への再送先を設けない。
内部ログ入力には10秒の反復制限を設定する。転送CaddyとConsulも通常のDocker入力から収集する。

`configs/vector.toml`が正規化と送信の正本である。
JSONと構造付きテキストを展開し、認識不能な本文も保持する。複数行例外を別コンテナと連結しない。
本文に含まれるホスト・サービス・コンテナID・streamは収集側の値で上書きする。
`stderr`だけではerrorと判定せず、重大度不明なら`unknown`とする。
既知の認証属性、要求全体・ヘッダーを除去し、Bearer値を伏せる。任意の文章中に混入した秘密を完全に識別する仕組みではないため、出力元の認証・本文制御が必要である。
0.58.0は環境変数展開が既定で無効のため、固定設定のプロジェクト条件を展開するフラグを明示する。
Vectorへ認証情報や業務サービスの環境変数を渡さない。

### Consul経由の投入

Vectorは内部の`http://log-router:8080/insert/jsonline`へJSONLを送り、時刻・本文・ストリームのクエリ引数を保持する。
Caddy 2.10.2の`dynamic a`が`consul-agent-logging:8600`へ明示的に問い合わせ、`SincroLogs.service.consul`のIPv4を9428へ転送する。
再解決は5秒、中央不在・critical・DNS不通・接続失敗は5xxで返す。Caddy独自の再試行は加えず、VectorのHTTP再試行に任せる。
検索APIなど投入以外のパスは404となり、転送口をホストへ公開しない。
`/health`はCaddy自身の生存だけを示し、中央到達性を保証しない。

`consul-agent-logging`はTCP/UDP 8320で参加する。中央専用の8321とは別の保存ボリュームとnode名を持つ。
`SincroLogCollector_<host>`と`SincroLogRouter_<host>`をそれぞれ登録し、8686と8080の`/health`を10秒間隔・5秒時間切れで確認する。
全ホストの個別状態はConsulの`/v1/health/service/SincroLogCollector`と`SincroLogRouter`で確認する。
bandogのDNS確認は少なくとも1台の正常なサービスの存在を示すものであり、全インスタンスの正常を保証しない。

### 原本・バッファ・復旧

全ComposeサービスはDockerの`local`ドライバーを使い、1ファイル20MiB相当・5世代を上限として回転させる。
中央へ直接送るDockerログドライバーを使わず、Vector停止中も`docker logs`から原本を読める。
Vectorの`vector-data`ボリュームは送信待ちの専用領域で、約256MiBを上限として満杯時は入力へ背圧をかける。
中央が停止してもVectorは起動できる。満杯時やDockerの原本回転後まで無欠落とは保証しない。
設定変更はコンテナの再作成で反映し、原本の保持設定変更と収集先変更を区別する。

Docker入力は起動前の短時間コンテナや停止中の原本の完全回収を保証しない。
初期化コンテナも対象ラベルに含むが、標準起動時の自動回収・再開位置・重複と欠落検知は回収タスクで実装する。
現段階で起動前の全ログを取得済みとは扱わない。

送信失敗は`docker compose logs vector log-router`、滞留と破棄は内部の`http://vector:9598/metrics`の`vector_buffer_received_events_total`と`vector_buffer_sent_events_total`の差、`vector_component_errors_total`、`vector_component_discarded_events_total`などで確認する。
監視APIとメトリクスはCompose内部だけに置く。バッファを削除する`down -v`を復旧手段にしない。

Dockerソケットの`:ro`はファイルのマウント属性であり、Docker APIを書込み不可にはしない。
Vectorはホストを管理できる権限を持つため、固定版の設定とイメージを管理者だけが変更する。
特権コンテナやDocker APIのホスト公開は追加しない。

### 収集の確認

`vector test`で`configs/vector.toml`と`configs/vector-tests.toml`を読み、正規化・識別子偽装・秘密属性の除去を確認する。
`node --test scripts/tests/log-collector.test.mjs`は人工ログだけの隔離Composeを使う。
製品の実ログ出力と複数ホスト間の到達・本文切替の最終確認は結合確認タスクで行う。

2026-09-22に[Docker入力](https://vector.dev/docs/reference/configuration/sources/docker_logs/)、
[HTTP送信](https://vector.dev/docs/reference/configuration/sinks/http/)、
[内部ログ](https://vector.dev/docs/reference/configuration/sources/internal_logs/)の公式設定を確認した。

## PythonのJSONL出力

4サービスは標準`logging`の共通設定を使い、Uvicornの既定設定による上書きを止める。
通常ログも例外も物理的に1行とし、`timestamp`、`level`、`logger`、`event`、`message`を保持する。
辞書メッセージと`extra`の属性はJSONの項目になる。未対応のオブジェクトは型名だけにし、モデル全体の暗黙の文字列化をしない。
例外は型とスタックのファイル名・行番号・関数名だけを残し、例外値・ソース行・ローカル変数を出さない。
第三者ロガー（NeMo、Uvicorn、HTTPクライアントなど）は要求URLや本文の混入を避けるため、本文を固定文へ置き換え、ロガー名・レベル・発生関数・行番号を残す。
起動時に既存ハンドラーを共通出力へ集約し、Python警告も同じ経路へ送る。

`recognition_result`、`conversation_input`、`conversation_fragment`、`conversation_final`だけが対話本文の`text`を持つ。
`session_id`、`speech_id`、`sequence_id`と`confirmed`で途中・確定を区別する。入力は新規要求だけを記録し、累積履歴を再出力しない。
応答はWebSocket送信成功後に記録し、取消・生成／送信失敗は最終結果として扱わない。
本文が無効でも`recognition_processing`、`conversation_processing`の処理時間・結果は残る。
PokeとMastraは同じ対話ワーカーを通る。NeMo補正の詳細追跡は機能用保存にのみ渡す。

**破壊的変更**: Pythonの標準出力と`--log-file`は従来のテキストからJSONLへ変わる。
ファイルは指定時だけ作成し、既存の10 MiB・100世代のローテーションを維持する。
設定を繰り返してもハンドラーを共有・重複しない。設定変更はコンテナの再作成で反映する。

## RTC・AgentServer・LLM

RTCは標準`slog.JSONHandler`を使い、時刻・レベル・本文キーを出力元で共通名へ揃える。
`session_id`、`stage`、`reason`などの既存属性を維持する。通常ログは標準出力、起動失敗は標準エラーのJSONLへ出す。
起動前の引数解析も直接のusage出力を止め、設定値を含み得る例外全文は出さず、`startup_failed`と例外型を残す。
Pionなど第三者の非JSON行はVectorが原本の文字列を取り込む。

AgentServerは導入済みMastraのPinoロガーを直接依存として宣言し、整形表示を無効にする。
`timestamp`・`level`・`message`への対応付けは出力元で行い、Pinoの数値`time`は補助項目として残る。
任意の要求・ヘッダー・例外・動的メッセージは出さず、固定メッセージと選別した診断属性を使う。
対話設定は厳密に検証し、無効時は`text`を出力しない。本文の主記録元はTextProcessorとし、AgentServerに重複した本文イベントは追加しない。
子ロガーでも同じ属性選別を適用する。配布起動窓口`start.mjs`は設定失敗もJSONLへ変換する。

TextProcessorが送る`memory.thread = sincromisor:<session_id>`を、認証済みAgent API要求の処理開始・引渡しへ対応付ける。
`agent_request_dispatched`はHTTPのSSE応答を渡した時点であり、生成の正常完了を意味しない。発話ID・シーケンスIDはAgentServerで作らない。
Studioの任意thread名は会話IDへ推測変換しない。MCPは接続開始・結果とツール開始・結果・所要時間を、設定上のサーバーIDとツール名だけで記録する。
未設定は`mcp_inactive`、失敗は`outcome=failed`とし、ツール入出力・認証・相手先URLを記録しない。

固定llama-serverの[公式ログ設定](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)を起動ラッパーへ渡す。
対話設定が有効なら`--log-jsonl --log-verbosity 3`、無効なら`--log-disable`を使う。
無効時は推論内部の詳細診断も失われるため、Dockerの状態・healthcheckとAgentServerの要求結果を使う。
共通ロガーより前のGPU等の短い起動警告は残る。人工本文の実推論で標準出力・標準エラーの非記録を確認する。
llamaのJSONLの`time`は経過時間なので、中央の発生時刻にはDockerの記録時刻を使う。

**破壊的変更**: RTCとAgentServerの運用ログをテキストからJSONLへ変更する。RTC・Mastra APIや会話履歴の契約は変更しない。

## 音声生成

`SINCRO_LOG_SYNTHESIS_ENABLED`は対話設定と独立し、VoiceSynthesizerとVectorの再作成で反映する。
有効時は`synthesis_request`と`synthesis_result`へ読み上げ本文、スタイルID、音声形式、実際の生成条件、取得元（`generated` / `redis` / `s3`）、所要時間を記録する。
結果の生成条件はキャッシュにも保存されたクエリから取り出す。音声本体・モーラ本文・カナはログへ複製しない。
処理境界で保持する会話・発話・シーケンスIDを付けるが、MessagePackとキャッシュキーは変更しない。
無効時は`synthesis_processing`の成功・失敗だけを残す。失敗は例外型と取得できるHTTP状態を使い、要求URL・理由句・例外本文を出さない。

固定VOICEVOX ENGINE 0.25.2にはアクセスログの本文だけを止める起動設定がない。
無効時はVectorが`sincro-voicevox`のイベント全体を共通メタデータと固定メッセージへ置換し、認識できるアクセス行からHTTPメソッドと状態だけを残す。
URLエンコード本文も任意の別属性も中央へ残さない。代わりにエンジン内部の詳細診断も失われる。
Dockerのローカル原本には要求URLが残り、既定の20MiB・5世代の回転まで管理者が読める。設定は既存原本・中央保存・Redis/S3キャッシュを削除しない。

## コンテナ状態とチェック診断

標準の各プロファイルは`log-observer`も起動する。Go標準ライブラリだけの補助処理が、5秒ごとにDocker Events、対象Composeのコンテナinspect、Consulの各ローカルエージェントの`/v1/agent/checks`と全体の`/v1/health/state/any`を読む。
Dockerソケット権限はVectorと同じで、ホストへのAPI公開や業務サービスの起動依存は追加しない。
`start`・`die`・`oom`・`health_status`はDockerの発生時刻、実コンテナID、Composeサービス名で記録する。
Vectorは管理下の`log-observer`から来る`docker_*`イベントだけを対象の共通項目へ対応付け、収集コンテナIDを`collector_container_id`へ分離する。

Docker healthcheckは直近の開始・終了時刻、終了コード、安全な診断を記録する。
初回の異常、新しいチェック結果、履歴なし（`history_missing`）、inspect取得失敗（`docker_health_query_failed`）を区別する。
Consulは実際の`target_node`、`service_id`、`check_id`、状態と診断を残し、同じ状態でも出力が変われば再記録する。
同じ状態でのOutput変更はクラスタへの同期が遅れるため、各ホストはローカルagentの結果を優先する。
Consulの全チェックも各収集ホストが観測するため、同じ対象の記録が複数ホストから届くことがある。

チェックの任意出力は保存しない。最大2048バイトを検査してHTTP状態、接続拒否、時間切れ、DNS、権限、空き容量など既知の原因へ分類する。
未知の本文は`output_redacted`、空は`empty_output`とし、上限超過は`diagnostic_truncated=true`で示す。URL、コマンド、環境、応答本文、原文のハッシュを代替項目へ残さない。
S3のwgetチェックとAgentServerの認証付きfetchは、出力元でもHTTP状態または`connection_failed`だけを出す。

取得失敗・復旧は`observer_query`に照会種別と安全な理由を記録する。
全照会が成功した場合だけ8687の死活確認が200となり、`SincroLogObserver_<host>`としてConsulへ登録する。
Docker Eventsは直近256件まで、health履歴も有限で、補助処理の停止中や大量発生時の全履歴は保証しない。秒単位の取得境界には重複があり得る。
再起動時の初回観測を出し直す。自動回収・欠落区間の扱いは回収タスクで補う。

bandogは従来の全サービス必須DNS判定と`/services.status`を維持し、ログ基盤に`SincroLogObserver`を加える。
初回とサービスごとの異常・復旧だけを`bandog_dns`へ出し、同じ状態は再出力しない。
`target_service`は監視先であり、ログの`host`はbandogの実行ホストである。DNSから監視先の配置ホストを推測しない。
各ホストの収集インスタンスの状態はConsulの実チェック記録で確認する。

Consulの同一状態の出力更新の遅延は[公式実装のCheckUpdateInterval](https://github.com/hashicorp/consul/blob/main/agent/config/runtime.go)と[agentチェックAPI](https://developer.hashicorp.com/consul/api-docs/agent/check)を確認した。

## ブラウザー診断

ブラウザーは同一オリジンのCaddy → Consulで探索するRTCへ診断を送り、RTCのJSONLを通常のVector経路で収集する。
管理者トークン、中央保存やVectorのURLを端末へ渡さない。追加の保存DB・受信サービス・公開ポートはない。
`source=browser`とタブ限りの`client_id`、端末の`client_time`、RTCの`received_at`を区別し、収集側の`host`は受信サーバーのホストを表す。
会話IDがない起動前の失敗も検索できる。任意本文や端末申告のhost/serviceは受け付けない。
有限キュー・再試行・端末喪失の限界は[共通枠組み](../frontend/app-shell.md#ブラウザーの障害診断)、受付上限は[RTC契約](../contracts/frontend-rtc.md#ブラウザー診断の受付)を参照する。

## 内部処理の失敗診断

内容記録の有効・無効にかかわらず、コマンド・HTTP/SSE・保存・LLM/MCP・Consul登録の境界で操作、相手、結果と取得可能なIDを記録する。例外の値ではなく型・既知コードを有限の `reason` へ変換する。音声変換のstderrは先頭64 KiBから既知原因語だけを採用し、原文や音声は中央へ送らない。未知原因は `failed` / `output_redacted` とし、推測で本文を採用しない。

認識のローカル/S3保存は `recognition_storage` で書込成功・拒否・接続失敗を記録する。ファイル名やS3キーを複製せず、従来の保存形式と失敗時の処理を維持する。Pythonのサービス発見は登録開始・成功・失敗、正常候補なしとConsul接続不能を分け、再試行を継続する。

初期化シェルは秘密の読取・検証・保存権限、モデルの存在・取得・検証、S3の署名確認、Consul登録と子プロセス終了の段階・終了コードを固定JSONへ出す。weed shellの出力は引き続き捨て、署名付き要求と不正キー拒否で起動を判定する。秘密ファイルが空の場合も利用サービスを起動しない。短命コンテナの過去ログ回収は配送・復旧の責務とする。
