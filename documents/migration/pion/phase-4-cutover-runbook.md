# Phase 4 停止切替リハーサルrunbook

## 目的

production相当環境でaiortcからPionへ停止切替し、Pionとaiortc rollback後の1 turnを一度だけ確認する。
実測値と未観測事項は[Gate 4結果](../../../tasks/sincro-rtc/task-260809020145-pion-phase-4-cutover-rehearsal/artifacts/gate-4-result.md)へ記録する。

この手順は[運用移行とロールバック](rollout-and-operations.md)のprofile、network、shutdown契約に従う。
Frontendと下流Python serviceはすでに起動済みのimageを使い、切替とrollbackでrebuildしない。
停止切替のため、接続中sessionは失われ、利用者は再接続が必要である。

## 切替前確認

メンテナンス開始を告知し、通常の実環境compose用環境変数を読み込む。ネットワーク設定を再監査しない。
PionがreadyになりChromeで接続できることを、固定UDP、NAT、firewallを含む環境前提の確認とする。

## aiortc停止とPion起動

aiortcへの新規受付を止め、既存sessionを終了する。sessionの移送はしない。

```sh
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
docker compose --profile full stop sincro-rtc
docker compose --profile full ps sincro-rtc
docker compose --profile pion up -d --no-build sincro-rtc-pion
docker compose --profile pion exec sincro-rtc-pion ip -4 addr show dev "${SINCRO_PION_INTERFACE}"
curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

成功判定はaiortcが`stopped`でTCP 8001を解放し、Pion container内の
`SINCRO_PION_INTERFACE`に`SINCRO_PION_CONTAINER_IPV4`があり、`/health/ready`と`/statuses`がHTTP 200を返すこととする。
PionはConsul登録とstartup dependency検証後、非draining時だけreadyになる。readiness失敗、port競合、または
Consul登録失敗ではsmoke testへ進まず、rollbackへ進む。

## Pion smoke test

stable endpointを使い、Gate 3で成立済みのChromeで1回、Pionへの接続、1 turnの会話、利用者/応答text、telop、
非無音の合成音声を確認する。実下流の応答本文は固定文と比較しない。session終了後に`/statuses`でactive sessionが
収束することを確認する。

対象`session_id`でPion logを絞り、`recognizer_result_received`、`processor_request_sent`、
`processor_result_received`、`synthesizer_result_received`の最後の到達stageを確認する。正常stageの直前に
最初の`pipeline_reset_requested`があれば、その`service`と有限の`cause`から閉じた下流connectionを確認する。
stage/reset logには本文・VoiceText・音声・Raw payloadを出力しないため、compose logやGit artifactへそれらを転載しない。

metricsとcompose logは原因調査に必要な最小範囲だけを、Git管理外の
`work/private-artifacts/task-260809020145-pion-phase-4-cutover-rehearsal/`へ保存する。session ID、SDP、
candidate、会話、音声payloadをGit artifactやresult artifactへ転載しない。

```sh
EVIDENCE_DIR=work/private-artifacts/task-260809020145-pion-phase-4-cutover-rehearsal
mkdir -p "${EVIDENCE_DIR}"
curl --fail --silent --show-error http://127.0.0.1:8001/metrics >"${EVIDENCE_DIR}/pion-metrics.prom"
docker compose --profile pion logs --no-color sincro-rtc-pion >"${EVIDENCE_DIR}/pion.log"
```

## rollback

signalingまたはICE接続成功率の重大な低下、critical media failure、resourceが収束しない、pipeline reconnect loop、
MessagePack互換error、継続するqueue overflow、または対象browserで会話不能を観測したらrollbackする。

```sh
time docker compose --profile pion stop -t 6 sincro-rtc-pion
docker compose --profile pion logs --no-color sincro-rtc-pion
docker compose --profile full up -d --no-build sincro-rtc
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

Pion停止の所要時間とlogは記録してよいが、Gateの合否条件にしない。aiortcの`/statuses`がHTTP 200となった後、
同じChromeで1回、接続、1 turnの会話、text、telop、非無音の合成音声を確認する。
Frontendと下流Python serviceはrebuildしない。切替中の接続とsession stateは回復しない。

## Gate判定と再実行

Gate 4の移行必須条件は、Pionとrollback後のaiortcで現行Frontendから接続し、1 turnの会話、text、telop、非無音音声が
成立すること、Pion session終了後にactive sessionと下流接続が収束すること、切替とrollbackでFrontendと下流serviceを
rebuildしないことだけとする。public UDP / NAT / firewallとaiortc / Pionの排他起動は、これらを観測する環境前提である。

Pion process crash自動復帰、soak、性能比較、障害注入、browser matrixの拡張、Docker挙動調査、環境の網羅監査、
新しいbrowser oracleはGate 4に含めない。aiortcで同じ経路が必要だと示す実害が出た場合だけ、根本原因、移行との関係、
最小受け入れ条件を持つ独立taskで扱う。移行必須条件の未達だけをFAILとし、未検証の追加要件をFAIL原因にしない。
移行必須条件を観測できない場合はPASSにせず、必要な観測点と解除条件を記録してGate taskを`blocked`にする。

この規則は次回の現行Gate 4 task実行から適用する。過去artifactと判定履歴は書き換えない。Pionとrollback後のaiortcの
移行必須条件を観測できるproduction相当smoke手順が利用可能になった時点で、このrunbookを最初から再実行する。
