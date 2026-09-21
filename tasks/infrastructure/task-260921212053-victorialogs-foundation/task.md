# VictoriaLogsの保存・検索基盤と共通ログ項目を導入する

## 背景と目的

ユーザーは、複数ホストのDocker Composeで動く全サービスについて「いつ、どのホストの、どのサービスで、何が発生したか」を集約・抽出する方式としてVector → VictoriaLogsを選択した。
対話テキストと音声生成ログはデフォルトで残し、`.env`で切り替える。本タスクは中央の保存・検索と後続タスクが使う共通仕様を扱う。

## 分割と依存関係

最初に[網羅性の棚卸し](../task-260921221013-logging-coverage-inventory/task.md)を行い、下表と追加タスクへ不足を割り当てる。

| 順序 | タスク                                                                              | 担当範囲                            |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------- |
| 1    | 本タスク                                                                            | 中央保存・検索と共通仕様            |
| 2    | [各ホストの収集](../task-260921212104-vector-host-collection/task.md)               | Vector、Dockerログ、送信バッファ    |
| 3    | [Pythonと対話ログ](../task-260921212105-python-conversation-logs/task.md)           | JSONL出力と認識・対話テキストの切替 |
| 4    | [音声生成ログ](../task-260921212105-speech-synthesis-logs/task.md)                  | 読み上げ本文、生成条件・結果の切替  |
| 5    | [RTCとAgentServer](../task-260921212105-rtc-agent-json-logs/task.md)                | Go・Mastraの構造化と会話ID          |
| 6    | [状態変化の記録](../task-260921212106-container-lifecycle-logs/task.md)             | Dockerイベント、bandog              |
| 7    | [複数ホストの結合確認](../task-260921212106-distributed-logging-acceptance/task.md) | 横断検索、設定切替、停止・復旧確認  |

2・3・5は1の後、4は2と3、6は2の後に着手する。追加した[ブラウザー障害](../task-260921221013-browser-diagnostic-logs/task.md)、[内部処理の失敗診断](../task-260921221014-runtime-failure-diagnostics/task.md)、[ホスト障害](../task-260921221014-host-system-diagnostic-logs/task.md)、[回収・欠落検知・復旧](../task-260921221014-logging-delivery-recovery/task.md)も完了してから7で網羅性を確認する。依存関係は各`meta.yaml`でも管理する。

## 共通仕様

- アプリは標準出力・標準エラーへ出力し、Vectorが形式統一・送信、VictoriaLogs単一ノードが保存・検索を担当する。
- 自前サービスは1イベント1行のJSONを基本とし、第三者サービスのテキストも収集する。
- 共通項目は`timestamp`、`observed_at`、`host`、`project`、`service`、`container_id`、`stream`、`level`、`event`、`message`とする。取得できない任意項目を推測で埋めない。
- `timestamp`はUTCのRFC 3339で、発生時刻不明ならDockerの記録時刻を使う。`observed_at`は収集時刻とする。
- `host`はホストごとの明示設定、`project`と`service`はComposeラベルを使う。コンテナのhostnameをホスト名として使わない。
- 会話に関係する処理には、保持している`session_id`、`speech_id`、`sequence_id`、`message_id`を付ける。既存RTC・msgpack契約は維持し、ブラウザー診断の追加HTTP APIだけは担当タスクで契約化する。
- 投入時に`timestamp`を`_time`、`message`を`_msg`へ対応付ける。ストリームは`host,project,service`で識別し、会話IDは通常の検索項目にする。

### 内容を記録する設定

| 設定キー                          | 既定値 | 対象                                                                         |
| --------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `SINCRO_LOG_CONVERSATION_ENABLED` | `true` | 音声認識テキスト、利用者入力、応答テキストを含む対話内容ログ                 |
| `SINCRO_LOG_SYNTHESIS_ENABLED`    | `true` | 読み上げ本文、話者・生成条件、キャッシュ結果、処理時間など音声生成の詳細ログ |

- `true` / `false`を受け、未指定時も有効にする。空文字など不正値は設定キーを示して起動時に拒否する。反映は対象コンテナの再作成時とする。
- 2設定は独立する。対話が無効でも音声生成が有効なら読み上げ本文は残る。両経路の本文を止めるには両方を無効にする。
- 無効化は自前サービスの出力元で対象の内容ログを止める。一般の稼働・失敗・状態変化ログは残し、本文を例外・要求全体の文字列表現・URL経由で迂回出力しない。
- 第三者サービスは公式のログ設定を優先し、出力元で止められない項目はVectorで除去して中央へ残さない。この場合はDocker側の原本に残る範囲を明記し、すべての保存先から消えるとは説明しない。
- 認証トークン・秘密鍵は有効時も記録しない。設定変更は保存済みログを削除しない。
- 切替は運用ログを対象とし、Mastraの機能用会話履歴、認識用の音声・結果保存、Redis・S3の音声キャッシュは変更しない。音声バイナリをJSONLに埋め込まず、必要なら既存保存物の識別子を残す。
- 各実装タスクで消費先とCompose受渡しを同時に追加し、未実装の設定を有効な機能として案内しない。

### Consulでの接続経路

- 中央を`SincroLogs`、各ホストのVectorを`SincroLogCollector`として登録する。IDにはホスト識別子を含める。
- 各ホストに小さなCaddyの`log-router`を標準同梱する。既存の`configs/Caddyfile`と同じ動的DNS転送を使い、Vectorの送信先は`http://log-router:8080/insert/jsonline`とする。正規化用のクエリ引数は保持して転送する。
- `log-router`は`dynamic a`で`SincroLogs.service.consul`を同居する`consul-agent-logging:8600`へ問い合わせ、IPv4・ポート9428・既存Caddyに合わせた5秒の再解決を使う。システムDNSがConsulを解決できるとの仮定を置かない。
- 単一ホストでは同じネットワークから到達できる中央のアドレス、分散配置では管理IPv4と9428をConsulへ広告する。再作成時の登録更新は既存の登録手順に合わせる。ホスト間向けの中央ポート公開は分散用定義だけに追加し、既定のローカル検索口はループバックに限定する。
- 中央不在・Consul不通・接続失敗は成功応答へ置き換えない。Caddyの5xxをVectorの再試行と永続バッファへ返し、Caddy側で独自の再送を重ねない。復旧・登録先変更後の再解決で送信を再開する。
- 転送口はCompose内部だけに置き、投入用のパスだけを転送する。Caddy自身と同居エージェントも収集対象とし、`SincroLogRouter`のインスタンスをConsulで監視する。プロセスの生存と中央の到達性は別の状態として扱う。
- この経路のVector・Caddy・同居エージェントの実装と結合確認は収集タスクが担当する。中央の登録・広告・死活確認は本タスクが担当する。

## 変更範囲と方針

本タスクの実装担当は中央保存・Consul登録と共通設定であり、下記の標準起動方針のうち各ホストのVector実装は収集タスクが担当する。標準起動全体の合格判定は最終結合確認で行う。

- ログ基盤をSincromisorの標準構成に含める。`compose.yml`からログ用定義をincludeし、配布用`.env`の既定`full,chat`と`docker compose up`だけで本体・Vector・VictoriaLogs・必要なConsulエージェントをまとめて起動する。別プロジェクトの起動、ログ専用の追加ファイル選択や手動起動を要求しない。
- 中央保存は標準`full`に含める。分散配置は中央を置くホストを1つ選び、`full`以外で中央を担当する場合のプロファイルを用意する。各ホストは設定済みの担当プロファイルで同じ`docker compose up`を使い、中央を意図せずホストごとに複製しない。収集は稼働する各サービスの既存プロファイルに同梱する。
- VictoriaLogsと各ホストのVectorをConsulへ登録・監視する。サービスIDをホスト間で衝突させず、再作成・異常・復旧で登録と死活状態が追随する。登録名・チェック・管理用広告アドレスを設計に明記し、全ホストの収集インスタンスを確認できるようにする。
- Vectorの中央接続はConsulのサービス発見を標準とする。中央IPや`SINCRO_LOG_ENDPOINT`の手動設定を必須にせず、Consulで登録先が変わった後の再解決を確認する。発見不能時はローカル保持と再試行を行い、架空の正常状態や本体の起動待ちを作らない。
- bandogの監視対象へログ基盤を加える。中央・収集の異常を見えるようにしつつ、本体の起動・会話処理をログ基盤のhealthyに依存させない。ConsulやVector自身のログも循環なく収集する。
- 検証した固定バージョンまたはダイジェストを使い、専用の永続ボリュームへ保存する。保持期間を`.env`から渡し、初期値は製品既定の7日を明示する。
- コンテナ内待受とホスト公開を分ける。検索口の既定公開はループバック限定とし、ホスト間の投入は明示設定した管理IP・管理VPN内へ限定する。全インターフェースへ既定公開しない。
- 管理ネットワークの到達制限を前提とし、非信頼ネットワークを経由する場合のTLS・認証終端を案内する。業務サービスの起動を中央に依存させない。
- `examples/compose.env`、追加Compose、保存先・接続先・死活確認と設計を同期する。死活確認は固定イメージで利用できるコマンドと正常応答を検証する。

## 完了条件と確認方法

- [x] 配布設定から単一の`docker compose up`で本体と中央保存・必要なConsulエージェントが起動し、登録・死活確認・Consulで取得した接続先への人工ログ投入が成立する。Vectorの標準起動と実ログ投入は収集タスクで確認する。
- [x] 隔離Composeで中央を起動し、人工的な日本語JSONLを投入して時刻・ホスト・サービスで検索し、`jq`で抽出できる。
- [x] 中央の再作成後も記録が検索でき、永続保存先と保持期限設定を確認できる。既存ログ領域を削除しない。
- [x] 中央停止・再作成でConsulの異常・復旧が反映され、照会で変更後の登録先を取得できる。Vectorによる再発見は収集タスクで確認する。中央障害で本体の起動を止めない。
- [x] 標準構成と管理IP指定時の構成を`docker compose config`で確認し、不要な公開と業務サービスへの起動依存がない。
- [x] 共通仕様、JSONL入出力と内部保存形式の違い、数値の文字列化、単一ノード停止・故障時の限界を文書化する。

## 対象外と文書同期

各ホストの収集・ブラウザー・内部診断・ホスト障害・配送対策は上記の担当タスクで行う。稼働環境の切替、Grafana、クラスタ化は本タスクに含めない。
実装時に`documents/design/infrastructure/logging.md`を新設し、`documents/design/index.md`、`infrastructure/compose.md`、`infrastructure/storage.md`、`infrastructure/consul.md`から参照する。`compose/distributed.yml`、`compose/consul-server.yml`、`Docker/consul/bandog.sh`と登録設定も必要な範囲で同期する。
計画と実装済み仕様を区別し、起票時点では現在設計を書き換えない。

## 調査根拠

2026-09-21確認。[Vector接続](https://docs.victoriametrics.com/victorialogs/data-ingestion/vector/)のHTTP JSONL投入と[検索API](https://docs.victoriametrics.com/victorialogs/querying/)を採用する。
[データモデル](https://docs.victoriametrics.com/victorialogs/keyconcepts/)と[保持期間](https://docs.victoriametrics.com/victorialogs/#retention)を運用手順へ反映する。
同日確認の[Caddyの動的DNS転送](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#dynamic-upstreams)と既存のCaddy設定を使い、Consulから接続先を解決する。

## 実装と確認結果

- 2026-09-22: `compose/logging.yml`を標準includeへ追加。VictoriaLogs v1.52.0を固定し、保存ボリューム、7日保持、ループバック公開、分散用管理IP広告、Consul登録とbandog監視を実装した。
- 配布設定の標準・分散Composeを展開して起動対象、公開先、業務サービスから中央への起動依存がないことを確認した。その実定義から中央とConsulを隔離し、単一の`compose up`で起動した。本体全サービスの再起動は行わず、全体の標準起動・実ログ収集は後続の結合確認で行う。
- `node --test scripts/tests/logging-foundation.test.mjs`: 日本語JSONLの投入、時刻・ホスト・サービス検索、数値の文字列化、jq抽出、中央停止のcritical、別IPへの再作成後のDNS更新・passing・保存済み検索、エージェント再作成後の登録を確認した。
- Consul起動スクリプトは公式entrypointの保存領域・設定読込み・権限設定を引き継ぐ。中央エージェントは収集側に予約された8320と分けて8321を使う。
- 共通項目、内容切替の契約と未実装範囲、保存形式、期限・単一ノードの限界を設計へ反映した。既存の保存領域・稼働サービスは変更していない。
- `node --test scripts/tests/bandog-consul.test.mjs`: 既存の欠損・停止・復旧確認が合格。中央復旧試験でConsulの状態同期RPCの一時的EOFを確認し、ローカルpassingとクラスタcriticalの差を採取した。試験の待機を既定再同期周期まで含む90秒に合わせた。
