# Pion Phase 6でPython RTC stackを削除する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

Gate 5がPASSし、利用者がPhase 6着手を判断した。通常運用はPionへ切り替わったが、Python / aiortcの
診断service、dependency、image、設定と旧`AudioBroker`が残り、同じRTC serviceを二重保守する状態である。
旧経路を削除してPionだけを正本とし、移行を完了する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-server/sincro-rtc/`のPython RTC実装・test、`Docker/sincro-rtc/`のaiortc image、
      composeの`aiortc` profile・`sincro-rtc-aiortc`・専用Consul agentを削除する。
- [ ] root Python workspace、dependency group、lock、下流service imageから`aiortc`と旧Python
      `sincro-rtc` packageへの依存を削除し、`uv lock --check`と対象Python検査が成立する。
- [ ] Go実装とcontainer imageを`pion-poc`ではなく通常serviceの`sincro-rtc`として配置・命名し、
      composeの`full` / `rtc` profileがそのimageだけを選ぶ。stable service名、TCP 8001、固定media UDP、
      signaling / DataChannel / MessagePack契約は変更しない。
- [ ] Python生成を含むMessagePack golden fixtureと互換testをGo RTC実装側に維持し、`go test ./...`がPASSする。
- [ ] current designからPython `AudioBroker`とaiortc診断経路の説明を除き、Go pipeline coordinatorの現在仕様へ
      統合する。移行文書はPhase 6完了状態へ更新し、履歴・判断根拠として残す。
- [ ] `docker compose config`、`npm run gate`、task検査がPASSし、VPSは新しいPion imageをrebuildして
      readiness、Consul登録、active session 0を確認する。aiortcの動作確認は行わない。

## 設計判断

- 旧実装をarchiveやcompatibility packageとして残さず削除する。Git履歴が保管を担う。
- 旧Python directoryを削除した同じ変更でGo directory、Dockerfile、image、Go module、commandを
  canonicalな`sincro-rtc`へ改名する。移行完了後に`pion-poc`という仮名称を通常経路へ残さない。
- Frontendのrevisionなしinitial Answer受理は、配信済みFrontendとの通信互換であり、aiortc削除だけを理由に
  除去しない。MessagePack fixtureも別initiativeが置換条件を定義するまで維持する。
- VPSでは既存Pion containerを止めず、push済みcommitを取得後に通常のcompose rebuild / recreateで置換する。
  stable portとservice discovery契約は維持する。

## スコープ境界

- 本タスク: Python RTC stack、aiortc dependency / image / compose / envの削除、Go RTC実装のcanonical rename、
  lockと下流image参照の整理、現在設計・移行文書の同期、VPS再deploy確認。
- 依存: Gate 5 PASS済みのPion stable endpointとforward-fix方針。
- スコープ外: Frontend / pipeline通信契約の変更、MessagePack fixture削除、Protocol Buffers、TURN、IPv6、
  複数instance、性能・負荷・soak、browser matrix、新しい運用tool。

## 実装方針

`sincromisor-server/sincro-rtc/`と`Docker/sincro-rtc/`を削除し、既存の
`sincromisor-server/sincro-rtc-pion-poc/`と`Docker/sincro-rtc-pion-poc/`をそれぞれcanonical pathへ移す。
import / module / build context / image参照は機械的に同期し、Pionのruntime処理は変更しない。

`compose/sincro-rtc.yml`からaiortc service、専用Consul agentとvolumeを削除し、`examples/compose.env`から
aiortc専用値だけを削除する。Pionと下流serviceが共有する`SINCRO_RTC_MAX_SESSIONS`等は維持する。
root `pyproject.toml`、`uv.lock`、下流Dockerfileは旧workspace memberを外した状態へ再生成・整理する。

現在設計は`documents/design/backend/services/audio-broker.md`を独立service文書として残さず、必要な
pipeline coordinator契約を`sincro-rtc.md`と`audio-pipeline-websocket.md`へ統合する。migration文書は
Phase 6完了を記録し、手順正本から完了済みcutover runbookへの通常導線を外す。

## テスト

- rename後のGo directoryで`go test ./...`を実行する。
- `uv lock --check`、`uv run ruff check`、既存の対象Python検査を実行し、旧workspace削除後も下流serviceを
  解決できることを確認する。
- `docker compose --env-file examples/compose.env --profile full config`と`--profile rtc config`で、
  RTC backendがPion `sincro-rtc`だけであり、`aiortc` profileが存在しないことを確認する。
- rootで`npm run gate`、`npm run tasks:check`、`npm run tasks:index:check`を実行する。
- push済みcommitをVPSへ取り込み、Pion imageをrebuild / recreateしてhealth、readiness、Consulの
  `RTCSignalingServer` passing、`/statuses`のactive session 0を確認する。既にGate 5で成立したbrowser smokeは反復しない。

## ドキュメント同期の要否

要。通信payloadは変えないが、唯一のRTC backend、compose profile、実装path、運用手順が変わるため、
少なくとも次を実装と同じ変更で同期する。

- `documents/design/backend/services/sincro-rtc.md`
- `documents/design/backend/services/audio-broker.md`と`documents/design/index.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/infrastructure/compose.md`
- `documents/design/infrastructure/consul.md`
- `documents/migration/pion/README.md`
- `documents/migration/pion/roadmap.md`
- `documents/migration/pion/implementation-phases.md`
- `documents/migration/pion/validation-plan.md`
- `documents/migration/pion/rollout-and-operations.md`
- `documents/migration/pion/phase-4-cutover-runbook.md`
