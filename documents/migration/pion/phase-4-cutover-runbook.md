# 段階 5 メンテナンス切替手順書

## 目的

通常プロファイルのPion `sincro-rtc` で1往復を確認し、利用再開後の安定性を観測する。
実測値と未観測事項は[Gate 5結果](../../../tasks/sincro-rtc/task-260822233904-pion-phase-5-maintenance-cutover/artifacts/gate-5-result.md)へ記録する。

この手順は[運用移行と現行版の修正で対応](rollout-and-operations.md)と
[Compose設計](../../design/infrastructure/compose.md)に従う。接続先、ホスト名、管理アドレスはGitへ記録せず、導入先の `.env` だけへ設定する。
フロントエンドと下流Pythonサービスはすでに起動済みの画像を使い、切替で再ビルドしない。
停止切替のため、接続中セッションは失われ、利用者は再接続が必要である。

## 切替前確認

メンテナンス開始を告知し、通常の実環境Docker Compose用環境変数を読み込む。
`SINCRO_CONSUL_SERVER_HOST` は既存Consulサーバー、`SINCRO_CONSUL_ADVERTISE_ADDR` と
`SINCRO_CONSUL_PUBLISH_HOST` は相互到達可能な管理ネットワーク、
`SINCRO_PION_SERVICE_BIND_HOST` はConsulの死活確認から到達できるRTCアドレスを指すことを確認する。
`SINCRO_PION_PUBLIC_IPV4` はブラウザ向けの責務であり、管理アドレスには使わない。

次で `rtc` が `consul-agent-rtc` と `sincro-rtc` の2サービスだけを選ぶことを確認する。

```sh
docker compose --profile rtc config --services | sort
```

エージェントのHTTP 8500はホストへ公開しない。管理ネットワークでは、既存サーバーのRPC TCP 8300とLAN gossip TCP/UDP 8301、
RTCエージェントのTCP/UDP 8311が相互到達可能でなければならない。

## Pion通常起動と準備状態

新規セッションを止め、終了時間切れ後に既存セッションを終了する。セッションの移送はしない。
更新前にローカルの状態を確認し、TCP 8001とメディアUDPポートを解放する。

```sh
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
docker compose --profile rtc stop -t 6 sincro-rtc
test -z "$(docker ps --filter publish=8001 --format '{{.Names}}')"
test -z "$(docker ps --filter publish="${SINCRO_PION_MEDIA_UDP_PORT}"/udp --format '{{.Names}}')"
```

更新済みのCompose定義でRTCエージェントを先に起動し、既存Consulサーバーへの参加を確認してからRTCを起動する。
`SINCRO_PION_CONSUL_HTTP_HOST` と `SINCRO_PION_CONSUL_HTTP_PORT` は廃止済みであり、設定しない。

```sh
docker compose --profile rtc build sincro-rtc
docker compose --profile rtc up -d --no-deps consul-agent-rtc
docker compose --profile rtc exec consul-agent-rtc consul members
docker compose --profile rtc up -d --no-deps sincro-rtc
curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
docker compose --profile rtc exec consul-agent-rtc consul catalog services
```

成功判定は、エージェントが既存サーバーを含むメンバー一覧で `alive` となり、`/health/ready` と `/statuses` がHTTP 200を返し、
`RTCSignalingServer` がカタログにあることとする。PionはConsul登録と起動時の依存関係検証後、非`draining`時だけreadyになる。
準備状態失敗、ポート競合、またはConsul登録失敗では動作確認へ進まず、証拠を保存して現行版の修正で対応する。

SIGTERMによる登録解除も確認する。

```sh
docker compose --profile rtc stop -t 6 sincro-rtc
docker compose --profile rtc exec consul-agent-rtc consul catalog services
```

停止後のカタログに `RTCSignalingServer` が残らないことを確認する。確認後に再起動する。

```sh
docker compose --profile rtc up -d --no-deps sincro-rtc
```

## 共通ブラウザ UI 動作確認

Pionで、固定エンドポイントとGate 3で成立済みのChromeを使い、次の手順を1回行う。
フロントエンドと下流Pythonサービスは、切替前から起動している画像をそのまま使い、再ビルドしない。

1. `simple-vrm`ページを開き、マイク権限を許可してUIから会話接続を開始する。診断 ConsoleのICE 状態が
   `connected`または`completed`になることを確認する。
2. 通常の短い発話を1回行い、会話の完了を待つ。実下流の利用者・応答本文は可変であるため、固定文と比較しない。
3. ブラウザ UIで利用者テキスト、応答テキスト、テロップが表示され、合成音声が非無音で再生されることを確認する。
4. UIから通常終了し、`/statuses`で有効セッションが収束することを確認する。

既存Gate 3 Playwright テストは模擬サービスの固定文を検査するため、Gate 5の判定には使わない。
新しいブラウザ検証基盤、入力注入、ブラウザの組み合わせは追加しない。会話本文、音声、セッション ID、SDP、候補は
Git成果物へ保存しない。

## Pion 動作確認

Pion起動後に[共通ブラウザ UI 動作確認](#共通ブラウザ-ui-動作確認)を1回実行する。

対象`session_id`でPionログを絞り、`recognizer_result_received`、`processor_request_sent`、
`processor_result_received`、`synthesizer_result_received`の最後の到達段階を確認する。正常段階の直前に
最初の`pipeline_reset_requested`があれば、その`service`と有限の`cause`から閉じた下流接続を確認する。
段階・リセットログには本文・VoiceText・音声・未加工の送受信データを出力しないため、Docker ComposeログやGit成果物へそれらを転載しない。

指標とDocker Composeログは原因調査に必要な最小範囲だけを、Git管理外の
`work/private-artifacts/task-260822233904-pion-phase-5-maintenance-cutover/`へ保存する。セッション ID、SDP、
候補、会話、音声送受信データをGit成果物や結果成果物へ転載しない。

`reason=codec_error` を確認した場合は、同じログの `codec_error_kind` と `codec_error_reason` を記録して後続タスクを判断する。
`codec_error_reason` は `empty_voice`、`decoded_pcm_invalid`、`speaking_time_mismatch`、`mora_timing_invalid`、
`input_timing_invalid`、`unknown` の固定値だけを使う。`unknown` は `unsupported`、`limit`、`timeout`、`process`、
復号コンテキスト不正、または非`DecodeError`を含む。送受信データを転載せず非公開成果物で再現条件を確認してからタスク化する。
セッション IDと音声送受信データは、種別を記録する場合もGit成果物へ転載しない。

```sh
EVIDENCE_DIR=work/private-artifacts/task-260822233904-pion-phase-5-maintenance-cutover
mkdir -p "${EVIDENCE_DIR}"
curl --fail --silent --show-error http://127.0.0.1:8001/metrics >"${EVIDENCE_DIR}/pion-metrics.prom"
docker compose --profile rtc logs --no-color sincro-rtc >"${EVIDENCE_DIR}/pion.log"
```

## Gate判定と再実行

Gate 5の移行必須条件は、通常プロファイルのPionで現行フロントエンドから接続し、1往復の会話、テキスト、テロップ、非無音音声が成立すること、
Pionセッション終了後に有効セッションと下流接続が収束することだけとする。公開UDP / NAT / ファイアウォールはこれらを観測する環境前提である。

aiortc動作確認、Pionプロセス異常終了自動復帰、長時間連続稼働、性能比較、障害注入、ブラウザの組み合わせの拡張、Docker挙動調査、環境の網羅監査、
新しいブラウザ正否判定器はGate 5に含めない。移行必須条件の未達だけをFAILとし、未検証の追加要件をFAIL原因にしない。
移行必須条件を観測できない場合はPASSにせず、必要な観測点と解除条件を記録してGateタスクを`blocked`にする。

Pionの移行必須条件を観測できるメンテナンス環境で、この手順書を最初から実行する。観測期間は利用者が段階6着手を判断するまで継続する。
