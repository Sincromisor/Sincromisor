# 切断診断と未完了件数を中央ログで結合確認する

## 背景 / 目的

出力元のテストだけではVectorによるpeer消失を検出できなかった。分割実装後の切断経路を既存収集設定で一度通し、中央検索で原因と影響を辿れることを確かめる。

優先度: 高。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [中央ログでパイプラインの通信相手を保持する](../task-261017221322-pipeline-peer-log-fields/task.md)
- [GoのWebSocket切断原因を再初期化ログへ残す](../task-261017221322-websocket-close-diagnostics/task.md)
- [Python音声サービスの接続終了を識別可能にする](../task-261017221323-python-websocket-lifecycle/task.md)
- [パイプライン再接続の試行と復旧を記録する](../task-261017221323-pipeline-reconnect-attempts/task.md)
- [パイプライン内部失敗の操作と原因を区別する](../task-261017221324-pipeline-runtime-causes/task.md)
- [合成完了とRTCへの音声送信結果を区別する](../task-261017221324-synthesis-websocket-delivery/task.md)
- [再初期化で未完了になった音声要求と破棄数を残す](../task-261017221325-pipeline-interruption-summary/task.md)

## 担当範囲

- [scripts/tests/log-collector.test.mjs](../../../scripts/tests/log-collector.test.mjs)
- [configs/vector.toml](../../../configs/vector.toml)
- [compose/logging.yml](../../../compose/logging.yml)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 新規監視基盤、全タスクの再監査、ブラウザー/Consul/AgentServerの結合試験、keepalive競合そのものの再現。

## 設計判断

- 既存の隔離確認構成を再利用し、人工会話IDとHTTP/WebSocket代役だけを使う。Go/Python本番ログ出力からVector→VictoriaLogs検索までを確認し、ログJSONの手書きだけで完了しない。
- 確認は既知理由付き切断、接続失敗→復旧、合成後送信失敗と部分受信の代表経路に限定する。本文設定は無効にし、秘密の人工印が中央にないことも確認する。
- 稼働サービスへ障害を注入せず、専用保存先を使う。原事象の1011を事後確定したとは記録しない。

## 完了条件

- [x] 中央検索からsession_id、peer、generation、原因コードと再接続結果を辿れる。
- [x] 合成成功と送信失敗が区別され、部分受信の結果未受信数とキュー破棄数を照合できる。
- [x] 使用したコマンド、人工入力、検索条件、結果をtask.mdへ簡潔に残す。公開成果物は秘密のない小さな集計だけとする。

## 確認方法

- 既存の隔離収集試験を元に対象経路だけ実行する。全サービス起動・GPU推論・長時間負荷・複数ホストを必須にしない。実装由来の不具合は原因を特定して修正後に当該確認を再実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。

## 実施結果

- `node --test scripts/tests/log-diagnostics.test.mjs`で、本番Go/Python出力→Docker journal→既存Vector→既存Caddy/Consul経路→VictoriaLogs検索を確認した。既存隔離収集構成の対象サービスと`scopeJournalFixture`を再利用し、全サービス起動や本番障害注入は行わない。
- Goは既存4サービスの実HTTP/WebSocket代役を使い、合成器から1011/`keepalive ping timeout`で切断した後、次の探索を1度だけ失敗させて復旧した。別の人工会話では既存部分受信試験で7要求送信・4結果受理を作った。いずれも本番Coordinator/clientのJSONLを変更せず投入した。
- PythonはHTTP代役のWAVを本番キャッシュ・生成・workerで処理し、WebSocket送信代役だけが`ConnectionError`を返す。音声形式は試験内でWAVへ限定し、未導入の`opusenc`へ依存しない。接続開始・合成処理・生成完了・配送失敗・接続終了を本番フォーマッターで出力した。
- 本文スイッチは両方false。人工本文、鍵、送信例外値、音声の印が中央結果にないことを検査した。IDは独立した3事例（`fixture-session`、`interruption-session`、`fixture`）であり、同一要求として誤って結合しない。

### 中央検索と集計

検索APIは`/select/logsql/query`、条件は`project:diagnostics-test-1104624 (service:sincro-rtc OR service:voice-synthesizer)`。試験は実行ごとに専用project名へ置き換える。取得行の`session_id`・`generation`・`peer`・イベント属性で次を照合した。

| 確認対象     | 中央検索で確認した値                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| 対象行       | 45件。出力元service、host、project、container_idを保持                                       |
| 既知切断     | `fixture-session`、世代1、相手VoiceSynthesizer、操作read、1011、keepalive_ping_timeout       |
| 再接続       | 世代2、相手SpeechExtractorのresolve試行1が失敗、試行2でsuccess                               |
| 部分受信     | `interruption-session`、世代1、送信7・受理4・結果未受信3、文字破棄8・音声破棄4               |
| 次世代       | 世代2の送信・受理・結果未受信は0                                                             |
| Python配送   | 合成処理successと生成完了の後、同じconnection_id/request_numberでsend/failed。終了原因もsend |
| 秘密の人工印 | 0件                                                                                          |

### 環境と確認範囲

- Docker接続先は`default`（`/var/lib/docker`）。既存イメージを`pull_policy=never`で使用し、取得・ビルド・タグ変更はない。Vector `d9130de32d31`、VictoriaLogs `3ec975e63af0`、Consul `1c59f007df8e`、Caddy `4c6e91c6ed0e`、人工出力用BusyBox `e226d6308690`を使用した。
- 保存は各専用コンテナのtmpfsへ置き、イメージ既定の匿名volumeもtmpfsへ置換した。終了時に今回のComposeコンテナ・ネットワークだけを`down`し、一時入力を削除する。既存volumeは使用・削除しない。
- Go対象2試験、Python対象1試験、中央結合1試験、Ruff・Biome・整形確認を実行した。試験結果と件数だけを残し、原本JSONLはコミットしない。
- この1011は人工入力であり、原事象の原因を事後確定したものではない。実GPU・マイク・NAT・複数ホストは未検証。
