# Pion RTCのConsul設定とservice登録を実装する

## 背景 / 目的

Pion は pipeline discovery の Consul endpoint を `127.0.0.1:8500` に固定し、`RTCSignalingServer` としても登録しない。そのため別 container の Consul agent を使う compose 構成では、下流4 service と既存 Caddy の stable signaling endpoint に接続できない。

Pion process が既存 Python RTC と同じ Consul 契約を使えるようにし、後続の排他的 compose task が backend を差し替えるだけで動く最小の runtime 設定・登録境界を実装する。

## 完了条件（受け入れ条件）

- [ ] `--consul-agent-host` / `--consul-agent-port`、`--fallback-host` / `--fallback-port`、`--service-bind-host` を起動設定として受け取る。Consul host / port は両方指定または両方未指定、fallback host / port も両方指定または両方未指定とする。指定されたhost・portと、Consul利用時の `service-bind-host` はHTTP listenerを開く前に検証する。Consul利用時の`--http` portは1〜65535、`service-bind-host` は単一のIPv4へ解決できなければならない。Consul未指定時はdiscoveryを無効化し、指定済みfallbackを4 service共通の既存 Caddy endpointとして使う。
- [ ] Consul 設定時、Pion は既存の `RTCSignalingServer` service 名で自身の HTTP endpoint を登録する。`service-bind-host` を起動時にIPv4へ解決してcontainer内 addressとして登録し、portには`--http`のportを使う。このportはcompose用に8001を指定する。service IDは既存Pythonと同じ `RTCSignalingServer_<service-bind-host>_<resolved-ip>:<http-port>` とする。`/health/ready`を10秒間隔、5秒timeout、critical後10分deregisterのHTTP checkとして登録し、passingだけをhealthyと扱う。SIGTERMのdraining開始時にderegisterする。
- [ ] pipeline resolver は設定済み Consul agent を使用し、既存の `SpeechExtractor`、`SpeechRecognizer`、`TextProcessor`、`VoiceSynthesizer` discovery 契約と、Consul失敗時の共通 fallback を維持する。
- [ ] fake Consul を使う結合テストで、登録 payload・service ID・ready check、ready publish後のpassing、4 service lookup、fallback、draining直後のderegisterとcleanup継続を確認する。Caddy / frontend / Python下流serviceの実装やbuildを変更しない。

## 設計判断

- Python の `ServiceDiscoveryReporter` を移植せず、既存 `internal/pipeline/discovery` と同じHTTP boundaryを使う最小の Consul agent register / deregister client を Go 側へ追加する。
- service address は Pion の WebRTC public IPv4 と分離する。前者は bridge network で Caddy が到達する container IPv4、後者はbrowserへ広告するpublic IPv4であり、同一値と仮定しない。
- listener bind後、non-ready状態でConsul登録を成功させ、直後に`MarkReady`してhealth checkを200にする。registration失敗時はlistenerとprocess共有UDP muxをcloseして起動失敗にする。終了時は`BeginDrain`直後に2秒上限のderegisterをcleanupと並行して開始し、1秒のdraining観測窓を遅延させない。deregister失敗は後続cleanupを妨げず、終了errorとして結合する。

## スコープ境界

- 本タスク: `internal/config`、Pion process lifecycle、Consul registration client、pipeline resolver配線、関連Go test、Pion READMEとmigration運用文書。
- 後続の排他的 compose task: Consul agent host、service address、container media bind IPv4、public IPv4、UDP/TCP portを `examples/compose.env` と compose へ具体的に配線し、実際の切替・復旧を確認する。
- スコープ外: compose編集、Caddy設定変更、Python下流service変更、Consul ACL/TLS、Consul watch / retry loop、NAT / firewall実測。

## テスト

- `go test -race ./internal/config ./internal/pipeline/discovery ./cmd/pion-poc`
- `go vet ./...`
- `npm run gate`

確認失敗時は command、対象commit、Consul request / response status、listener / process状態をcleanup前に採取する。直接原因を特定し、最小再現、修正、失敗した確認、全体gateの順に再検証する。原因未特定のまま後続compose taskへ移管しない。

## ドキュメント同期の要否

要。`sincromisor-server/sincro-rtc-pion-poc/README.md`、`documents/migration/pion/rollout-and-operations.md`、`documents/design/infrastructure/consul.md`へ設定名、service registration、readinessの契約を同期する。Frontend RTC HTTP / DataChannel契約は変更しない。
