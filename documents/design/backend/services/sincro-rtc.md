# Backend Service: sincro-rtc

## Summary

- `sincro-rtc` は WebRTC signaling API と RTC session process を提供する入口サービスである。
- 1 session を 1 process で分離し、音声処理は `VoiceTransformTrack` から AudioBroker へ委譲する。
- フロントとの通信契約は `contracts/frontend-rtc.md` を正本とする。

## Scope

- 対象:
    - `RTCSignalingServer.py`
    - `RTCSessionManager`
    - `RTCSessionProcess`
    - `VoiceTransformTrack`
- 非対象:
    - AudioBroker 内部
    - downstream service の推論処理
    - payload 詳細

## Responsibilities

- `RTCSignalingServer`
    - FastAPI endpoint 定義、設定配布、セッション上限制御、shutdown cleanup。
- `RTCSessionManager`
    - session id 採番、process lifecycle、existing session update、cleanup。
- `RTCSessionProcess`
    - aiortc handler、Offer / Answer、candidate 適用、DataChannel / track の受理。
- `VoiceTransformTrack`
    - 入力 audio frame を AudioBroker へ渡し、返却 voice / text / telop を WebRTC へ戻す。

## Interfaces

- 外部契約:
    - `documents/design/contracts/frontend-rtc.md`
- 下流契約:
    - `documents/design/contracts/audio-pipeline-websocket.md`

## Config / Deployment

- 主な env:
    - `SINCRO_RTC_HOST`
    - `SINCRO_RTC_PORT`
    - `SINCRO_RTC_PUBLIC_BIND_HOST`
    - `SINCRO_RTC_PUBLIC_BIND_PORT`
    - `SINCRO_RTC_FORWARDED_ALLOW_IPS`
    - `SINCRO_RTC_MAX_SESSIONS`
    - `SINCRO_RTC_FALLBACK_HOST`
    - `SINCRO_RTC_FALLBACK_PORT`
    - `SINCRO_CONSUL_AGENT_HOST`
    - `SINCRO_CONSUL_AGENT_PORT`
- compose:
    - `compose/sincro-rtc.yml`

## Observability / Failure Modes

- `/statuses` の `sessions` を簡易メトリクスとして使う。
- Offer update と fallback、新規 session 作成のログを確認する。
- invalid / late candidate は無害化ログを出す。
- `connectionState=failed` は session close と reconnect の切り分け対象にする。
- Offer の子プロセス応答が 15 秒以内に届かない場合は、その session process と pipe を回収して 503 を返す。
- session 上限到達時は active session の更新だけを許可し、新規作成は 429 で拒否する。

## Change Checklist

- Offer / candidate payload を変える時は `contracts/frontend-rtc.md`、frontend、model を同時更新する。
- session lifecycle を変える時は cleanup と process kill path を確認する。
- track の停止経路では、所有する AudioBroker の WebSocket と通信 thread が一度だけ解放されることを確認する。
- AudioBroker 接続を変える時は `backend/services/audio-broker.md` と WebSocket contract を確認する。

## References

- `documents/design/contracts/frontend-rtc.md`
- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/archive/legacy-flat/backend_sincro_rtc.md`
