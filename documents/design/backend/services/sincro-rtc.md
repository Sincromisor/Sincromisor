# Backend Service: sincro-rtc

## Summary

- `sincro-rtc` はPionによる WebRTC signaling API と RTC session を提供する通常入口サービスである。
- 1 sessionの音声処理はGo pipeline coordinatorへ委譲する。Python実装はaiortc診断profileにだけ残る。
- フロントとの通信契約は `contracts/frontend-rtc.md` を正本とする。

## Scope

- 対象:
    - `sincromisor-server/sincro-rtc-pion-poc/cmd/pion-poc`
    - Pion session / signaling / pipeline coordinator
- 非対象:
    - AudioBroker 内部
    - downstream service の推論処理
    - payload 詳細

## Responsibilities

- Pion signaling
    - config / offer / candidate / statuses、session上限制御、drainingとshutdownを提供する。
- Pion session
    - Offer / Answer、candidate、DataChannel / track、ICE restartを処理する。
- Go pipeline coordinator
    - 入力 audioを下流4 serviceへ渡し、voice / text / telopをWebRTCへ戻す。

## Interfaces

- 外部契約:
    - `documents/design/contracts/frontend-rtc.md`
- 下流契約:
    - `documents/design/contracts/audio-pipeline-websocket.md`

## Config / Deployment

- 主な env:
    - `SINCRO_PION_MEDIA_UDP_PORT`
    - `SINCRO_PION_PUBLIC_IPV4`
    - `SINCRO_PION_STUN`
    - `SINCRO_PION_FFMPEG_PATH`
    - `SINCRO_RTC_MAX_SESSIONS`
    - `SINCRO_PION_CONSUL_HTTP_HOST`
    - `SINCRO_PION_CONSUL_HTTP_PORT`
    - `SINCRO_PION_SERVICE_BIND_HOST`
- compose:
    - `compose/sincro-rtc.yml`

## Observability / Failure Modes

- `/health/ready` と `/statuses` の `sessions` / `ready` / `draining` を確認する。
- Offer update、fallback、新規session、pipeline stageの構造化logを確認する。
- invalid / late candidate は無害化し、session上限時は新規作成を429で拒否する。

## Change Checklist

- Offer / candidate payload を変える時は `contracts/frontend-rtc.md`、frontend、model を同時更新する。
- session lifecycleを変える時はdraining、close deadline、pipeline coordinatorのclose pathを確認する。
- pipeline接続を変える時は `backend/services/audio-broker.md` と WebSocket contractを確認する。

## References

- `documents/design/contracts/frontend-rtc.md`
- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/archive/legacy-flat/backend_sincro_rtc.md`
