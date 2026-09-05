# バックエンドサービス: sincro-rtc

## 要約

- `sincro-rtc` はPionによるWebRTCシグナリングAPIとRTCセッションを提供する通常入口サービスである。
- 1セッションの通信資源はRTC層、会話状態はGoパイプライン調停器が所有する。
- フロントとの通信は[フロントエンドのRTC契約](../../contracts/frontend-rtc.md)、下流4サービスとの通信は[音声パイプラインWebSocket契約](../../contracts/audio-pipeline-websocket.md)を正本とする。

## 対象範囲

- 対象:
    - [`cmd/sincro-rtc`](../../../../sincromisor-server/sincro-rtc/cmd/sincro-rtc)
    - [`internal`](../../../../sincromisor-server/sincro-rtc/internal)以下のPionセッション、シグナリング、音声処理、会話パイプライン
- 非対象:
    - 下流サービス内部の推論処理
    - 契約文書を正本とする送受信データ詳細

## 責務境界

| 境界             | 所有パッケージ                                                                                                                                                                                                                                               | 責務                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 起動処理         | [`cmd/sincro-rtc`](../../../../sincromisor-server/sincro-rtc/cmd/sincro-rtc)、[`internal/config`](../../../../sincromisor-server/sincro-rtc/internal/config)                                                                                                 | 設定と外部実行ファイルを検証し、共有Pionネットワーク、各登録簿、HTTP提供を順に構築する。終了時は`draining`公開、Consul解除、共有資源、HTTPの順を調停する。               |
| シグナリング     | [`internal/signaling`](../../../../sincromisor-server/sincro-rtc/internal/signaling)、[`offer`](../../../../sincromisor-server/sincro-rtc/internal/signaling/offer)                                                                                          | `config`、`offer`、`candidate`、`statuses`、静的配信を提供する。Offer 登録簿は重複要求、候補収集、容量、完了値と終了を示す記録の期限を所有する。                         |
| RTCセッション    | [`internal/rtc`](../../../../sincromisor-server/sincro-rtc/internal/rtc)、[`network`](../../../../sincromisor-server/sincro-rtc/internal/rtc/network)                                                                                                        | ManagerとSessionがPeerConnection、トラック、ICE再接続、終了処理を所有する。ネットワークは全セッション共有のPion APIとUDP4ソケットを所有する。                            |
| DataChannel      | [`internal/rtc/datachannel`](../../../../sincromisor-server/sincro-rtc/internal/rtc/datachannel)                                                                                                                                                             | `text_ch`と`telop_ch`の送受信データ検証、有限キュー、送信、送信待ちデータ量超過時の終了判断を所有する。                                                                  |
| 入出力音声       | [`internal/media/input`](../../../../sincromisor-server/sincro-rtc/internal/media/input)、[`output`](../../../../sincromisor-server/sincro-rtc/internal/media/output)、[`synthdecode`](../../../../sincromisor-server/sincro-rtc/internal/media/synthdecode) | 入力RTPの並べ替え・Opus復号・PCM変換、合成音声コンテナのPCM復号、送信時計・Opus符号化・発話キューを分担する。                                                            |
| 会話パイプライン | [`internal/pipeline`](../../../../sincromisor-server/sincro-rtc/internal/pipeline)                                                                                                                                                                           | 下流4サービスを同一世代で接続し、確認済み履歴、発話途中の状態、入力キュー、失敗時の一括再初期化を所有する。子パッケージがクライアント、探索、MessagePack境界を分担する。 |
| 観測             | [`internal/observability`](../../../../sincromisor-server/sincro-rtc/internal/observability)                                                                                                                                                                 | プロセス固有のPrometheus 登録簿を構築し、送受信データを受け取らないRecorder境界と固定表示名語彙を提供する。稼働セッション数は作成と終了の所有権移動として記録する。      |

## 代表的な処理の流れ

1. 起動処理が設定を検証し、共有UDP4ソケット、観測先、パイプライン生成処理、RTC Manager、Offer 登録簿、HTTP サーバーを構築する。
2. シグナリングがOfferを受理し、RTC ManagerがSessionを作成してAnswerとセッションIDを返す。
3. 受信トラックは入力音声処理を経てPCMとなり、会話パイプラインが下流4サービスへ順に渡す。
4. 応答テキストはDataChannel、合成音声は復号・送信音声処理を経て送信トラックへ戻る。
5. 終了時は新規Offerを拒否しながらConsul登録、Offer、Session、HTTP 待受処理を有限期限で収束させる。

## 試験配置方針

- Goの単体試験は対象パッケージと同じディレクトリに置く。非公開状態の検証が必要な場合は同じパッケージ名を使い、本番要素を公開しない。
- 独立した本番責務を子パッケージへ抽出する場合は、その責務を検証する試験と固定データを対で移す。
- 外部結合試験を別ディレクトリへ置くのは、既存の公開境界だけで起動・操作・検証・終了できる場合に限る。
- 試験を別パッケージや別ディレクトリへ移す目的で、本番の型、関数、状態、試験専用フックを公開しない。公開境界だけで成立しない試験は元のパッケージに残す。
- 実プロセスやブラウザーを所有するGate 3試験は[`internal/gate3`](../../../../sincromisor-server/sincro-rtc/internal/gate3)に置き、通常の単体試験と生存期間を分ける。

## インターフェース

- 外部契約:
    - [フロントエンドのRTC契約](../../contracts/frontend-rtc.md)
- 下流契約:
    - [音声パイプラインWebSocket契約](../../contracts/audio-pipeline-websocket.md)

## 設定と配備

- 主な環境変数:
    - `SINCRO_PION_MEDIA_UDP_PORT`
    - `SINCRO_PION_PUBLIC_IPV4`
    - `SINCRO_PION_STUN`
    - `SINCRO_PION_FFMPEG_PATH`
    - `SINCRO_RTC_MAX_SESSIONS`
    - `SINCRO_PION_CONSUL_HTTP_HOST`
    - `SINCRO_PION_CONSUL_HTTP_PORT`
    - `SINCRO_PION_SERVICE_BIND_HOST`
- Docker Compose:
    - `compose/sincro-rtc.yml`

## 観測と失敗モード

- `/health/ready` と `/statuses` の `sessions` / `ready` / `draining` を確認する。
- Offer 更新、代替処理、新規セッション、処理工程段階の構造化ログを確認する。
- 無効 / 遅延した候補は無害化し、セッション上限時は新規作成を429で拒否する。

## 変更時の確認

- Offer / 候補送受信データを変える時は `contracts/frontend-rtc.md`、フロントエンド、モデルを同時更新する。
- セッションの生存期間を変える時は`draining`、終了期限、パイプライン調停器の終了パスを確認する。
- 処理工程接続を変える時は WebSocket 契約を確認する。

## 参照

- [フロントエンドのRTC契約](../../contracts/frontend-rtc.md)
- [音声パイプラインWebSocket契約](../../contracts/audio-pipeline-websocket.md)
- [旧Python実装の履歴](../../archive/legacy-flat/backend_sincro_rtc.md)
