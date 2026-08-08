# Infrastructure: Consul

## Summary

- Consul は backend microservices の service discovery に使う。
- AudioBroker と Pion RTC は worker service を Consul から解決し、未解決時は fallback 設定を使う。
- service 名や public bind を変える場合は compose と設定クラスを同時確認する。

## Scope

- 対象:
    - Consul agent
    - service registration
    - worker discovery
    - fallback host / port
- 非対象:
    - Consul cluster 運用の詳細
    - downstream service の内部処理

## Responsibilities

- 各 service は起動時に Consul へ登録する。
- Pion RTC は `RTCSignalingServer` として、`SINCRO_PION_CONSUL_HTTP_HOST` / `SINCRO_PION_CONSUL_HTTP_PORT`のHTTP endpointへ、
  `SINCRO_PION_SERVICE_BIND_HOST`で解決したaddressと`/health/ready` check（10秒間隔、5秒timeout、critical後10分deregister）を登録する。draining開始直後に解除する。
  Pionはcross-host gossip agentを必要としない。
- AudioBroker は SpeechExtractor / SpeechRecognizer / TextProcessor / VoiceSynthesizer の到達先を解決する。
- Consul が使えない場合でも fallback host / port で開発継続できるようにする。

## Change Checklist

- service 名を変える場合は登録側、探索側、compose、env を同時更新する。
- public bind host / port を変える場合は RTC config と reverse proxy の影響を確認する。
- fallback 設定を変える場合は Consul 未起動時の挙動を確認する。

## References

- `documents/design/infrastructure/compose.md`
- `documents/design/archive/legacy-flat/service_consul.md`
