# Phase 5 メンテナンス切替runbook

## 目的

通常profileのPion `sincro-rtc` で1 turnを確認し、利用再開後の安定性を観測する。
実測値と未観測事項は[Gate 5結果](../../../tasks/sincro-rtc/task-260822233904-pion-phase-5-maintenance-cutover/artifacts/gate-5-result.md)へ記録する。

この手順は[運用移行とforward-fix](rollout-and-operations.md)のprofile、network、shutdown契約に従う。
Frontendと下流Python serviceはすでに起動済みのimageを使い、切替でrebuildしない。
停止切替のため、接続中sessionは失われ、利用者は再接続が必要である。

## 切替前確認

メンテナンス開始を告知し、通常の実環境compose用環境変数を読み込む。ネットワーク設定を再監査しない。
PionがreadyになりChromeで接続できることを、固定UDP port、NAT、firewallを含む環境前提の確認とする。

## Pion通常起動とreadiness

新規sessionを止め、close timeout後に既存sessionを終了する。sessionの移送はしない。

### staging VPSの旧serviceを止める（一回限り）

`work/vps.md` のstaging VPSは、更新前revisionのproject `sincromisor` で旧service
`sincro-rtc-pion` がTCP 8001と`SINCRO_PION_MEDIA_UDP_PORT`（現在3479/udp）を公開している。
この手順は**Pion通常serviceを含むcommitをVPS checkoutへ反映する前**に実行する。メンテナンス告知で
新規sessionを止め、stable endpointの`/statuses`で`"sessions":0`を確認してから、更新前のcompose定義で停止する。

```sh
# 更新前のVPS checkoutで実行する。外部Consulは10.39.2.8:8500を継続利用する。
curl --fail --silent --show-error \
  https://sincromisor-staging.negix.org/api/v1/RTCSignalingServer/statuses
docker compose -p sincromisor --profile pion stop -t 6 sincro-rtc-pion
test -z "$(docker ps --filter publish=8001 --format '{{.Names}}')"
test -z "$(docker ps --filter publish=3479/udp --format '{{.Names}}')"
```

ここでTCP 8001とUDP media portが解放されるまで、新serviceを起動せず利用を再開しない。次にVPS checkoutへ
Pion通常serviceを含むcommitを反映し、`SINCRO_PION_CONSUL_HTTP_HOST=10.39.2.8` と
`SINCRO_PION_SERVICE_BIND_HOST=10.39.2.1` を維持したまま新imageをbuildする。以降のcommandは更新後のcompose定義で実行する。

```sh
docker compose -p sincromisor --profile rtc build sincro-rtc
docker compose -p sincromisor --profile rtc up -d --no-deps sincro-rtc
docker compose -p sincromisor --profile rtc exec sincro-rtc sh -c 'test "$(ip -4 -o addr show dev "${SINCRO_PION_INTERFACE}" scope global | wc -l)" -eq 1'
curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

成功判定はPion container内の`SINCRO_PION_INTERFACE`に非-unspecified IPv4がちょうど1つあり、
`/health/ready`と`/statuses`がHTTP 200を返すこととする。
PionはConsul登録とstartup dependency検証後、非draining時だけreadyになる。readiness失敗、port競合、または
Consul登録失敗ではsmoke testへ進まず、証拠を保存してPionをforward-fixする。

## 共通browser UI smoke

Pionで、stable endpointとGate 3で成立済みのChromeを使い、次の手順を1回行う。
Frontendと下流Python serviceは、切替前から起動しているimageをそのまま使い、rebuildしない。

1. `simple-vrm`ページを開き、マイク権限を許可してUIから会話接続を開始する。Debug ConsoleのICE stateが
   `connected`または`completed`になることを確認する。
2. 通常の短い発話を1回行い、会話の完了を待つ。実下流の利用者・応答本文は可変であるため、固定文と比較しない。
3. browser UIで利用者text、応答text、telopが表示され、合成音声が非無音で再生されることを確認する。
4. UIから通常終了し、`/statuses`でactive sessionが収束することを確認する。

既存Gate 3 Playwright testはmock serviceの固定文を検査するため、Gate 5の判定には使わない。
新しいbrowser harness、入力注入、browser matrixは追加しない。会話本文、音声、session ID、SDP、candidateは
Git artifactへ保存しない。

## Pion smoke test

Pion起動後に[共通browser UI smoke](#共通browser-ui-smoke)を1回実行する。

対象`session_id`でPion logを絞り、`recognizer_result_received`、`processor_request_sent`、
`processor_result_received`、`synthesizer_result_received`の最後の到達stageを確認する。正常stageの直前に
最初の`pipeline_reset_requested`があれば、その`service`と有限の`cause`から閉じた下流connectionを確認する。
stage/reset logには本文・VoiceText・音声・Raw payloadを出力しないため、compose logやGit artifactへそれらを転載しない。

metricsとcompose logは原因調査に必要な最小範囲だけを、Git管理外の
`work/private-artifacts/task-260822233904-pion-phase-5-maintenance-cutover/`へ保存する。session ID、SDP、
candidate、会話、音声payloadをGit artifactやresult artifactへ転載しない。

`reason=codec_error` を確認した場合は、同じログの `codec_error_kind` と `codec_error_reason` を記録して後続taskを判断する。
`codec_error_reason` は `empty_voice`、`decoded_pcm_invalid`、`speaking_time_mismatch`、`mora_timing_invalid`、
`input_timing_invalid`、`unknown` の固定値だけを使う。`unknown` は `unsupported`、`limit`、`timeout`、`process`、
decode context不正、または非`DecodeError`を含む。payloadを転載せずprivate artifactで再現条件を確認してからtask化する。
session IDと音声payloadは、種別を記録する場合もGit artifactへ転載しない。

```sh
EVIDENCE_DIR=work/private-artifacts/task-260822233904-pion-phase-5-maintenance-cutover
mkdir -p "${EVIDENCE_DIR}"
curl --fail --silent --show-error http://127.0.0.1:8001/metrics >"${EVIDENCE_DIR}/pion-metrics.prom"
docker compose --profile rtc logs --no-color sincro-rtc >"${EVIDENCE_DIR}/pion.log"
```

## Gate判定と再実行

Gate 5の移行必須条件は、通常profileのPionで現行Frontendから接続し、1 turnの会話、text、telop、非無音音声が成立すること、
Pion session終了後にactive sessionと下流接続が収束することだけとする。public UDP / NAT / firewallはこれらを観測する環境前提である。

aiortc動作確認、Pion process crash自動復帰、soak、性能比較、障害注入、browser matrixの拡張、Docker挙動調査、環境の網羅監査、
新しいbrowser oracleはGate 5に含めない。移行必須条件の未達だけをFAILとし、未検証の追加要件をFAIL原因にしない。
移行必須条件を観測できない場合はPASSにせず、必要な観測点と解除条件を記録してGate taskを`blocked`にする。

Pionの移行必須条件を観測できるメンテナンス環境で、このrunbookを最初から実行する。観測期間は利用者がPhase 6着手を判断するまで継続する。
