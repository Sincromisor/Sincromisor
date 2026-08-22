# Pion Phase 5のメンテナンス切替と安定化観測を実行する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

Gate 4はPASSしたが、通常の`full` / `rtc` profileと現在設計はaiortcを正本のbackendとしており、
production相当環境でPionが動いたことだけではstable endpointの移行は完了しない。
メンテナンス時間にPionへ停止切替し、利用再開後の安定性を確認してGate 5を判定する。

## 完了条件（受け入れ条件）

- [ ] 通常の`full` / `rtc` profileでPion版だけがstable TCP 8001と固定media UDP portを公開し、
      aiortc版は明示的な診断用途でだけ起動できる。両backendを同じ運用projectで同時起動しない。
- [ ] `examples/compose.env`、compose、Pion起動引数、Consul登録先、healthcheckが同じservice名、address、portを参照し、
      `docker compose config --services`で通常`full` / `rtc`起動とaiortc診断起動を確認できる。
      現行`rtc` profileのprofile外`service-initializer`依存も解消し、`rtc`単独のconfigを成立させる。
- [ ] 合意したメンテナンス時間に新規sessionを止め、close timeout後にaiortcを停止してPionを起動する。
      Pionのreadiness確認までは利用を再開しない。
- [ ] stable endpointのChrome UIで1回、signaling、ICE、1 turnの会話、利用者・応答text、telop、非無音の合成音声、
      session終了後のactive sessionと下流接続の収束を確認してから利用を再開する。
- [ ] 利用再開後、[運用移行とforward-fix](../../../documents/migration/pion/rollout-and-operations.md)の
      Pion問題時の条件を観測する。期間を根拠のない固定日数にせず、Phase 6着手前に利用者が終了を判断するまで本タスクをopenに保つ。
- [ ] 対象commit、実行日時、環境、command、切替所要時間、smoke結果、観測期間、問題の有無、未観測事項、残リスク、
      `gate_5_result`を`artifacts/gate-5-result.md`へ記録する。問題条件への該当または未解決のPion固有critical issueがあれば
      PASSにせず、揮発する証拠を保存して原因別のforward-fix taskを起票する。
- [ ] Gate 5 PASS時点で通常運用構成と現在設計がPionを正本とし、Python `AudioBroker`への新機能追加を停止することが
      現在設計に明記されている。

## 設計判断

- Gate 4で検証済みのcompose、network、browser UI smoke、health、statuses、metricsを再利用し、切替専用CLIや新しいharnessを作らない。
- aiortcはPion切替後の運用rollback先にしない。問題時は証拠を保存し、Pionへの新規Offerを止めてforward-fixする。
- 観測期間は実害の有無を確認するための期間であり、根拠のない日数、traffic量、成功率をGateへ追加しない。
  利用再開後にユーザーがPhase 6へ進む判断をした時点で終了し、その間に問題条件へ該当しないことをGate 5の証拠とする。
- aiortc実装、image、診断設定の削除はPhase 6へ残す。Phase 5では通常起動経路から外すだけとする。
- aiortcは`aiortc` profileへ残すが、Pion移行を前提として動作確認は行わない。
- 検証環境はこのホストの下流serviceと`work/vps.md`のstaging VPSを連携させて使う。

## スコープ境界

- 本タスク: 通常compose profileのPion既定化、aiortc診断profile、envと現在設計の同期、実運用停止切替、smoke、安定化観測、Gate 5判定。
- 依存: Gate 4 PASS済みのimage、network、排他的compose、runbook。
- スコープ外: Python RTC stack削除、Protocol Buffers移行、TURN、IPv6、複数Pion instance、soak、負荷・性能比較、browser matrix。

## 実装方針

`compose/sincro-rtc.yml`のprofileとservice名を最小限変更し、通常起動ではPionだけを選ぶ。
Pion設定値は`examples/compose.env`を供給元、compose commandを消費先とし、Consulのstable service名
`RTCSignalingServer`、stable TCP 8001、固定media UDP portの公開契約を維持する。
PionとそのConsul依存は`full` / `rtc`のどちらでも解決可能にし、aiortcとその専用依存は診断profileへ分離する。

実行手順は既存の[Phase 4 runbook](../../../documents/migration/pion/phase-4-cutover-runbook.md)をPhase 5の実運用手順へ更新して使う。
切替失敗時は環境復旧より先に、command、commit、時刻、exit code、health、statuses、必要最小限のmetricsとlogを
`work/private-artifacts/task-260822233904-pion-phase-5-maintenance-cutover/`へ保存する。
会話本文、音声payload、session ID、SDP、candidateはGit artifactへ置かない。

## テスト

- `docker compose config`で通常`full` / `rtc` profileがPionだけを選び、aiortc診断profileがPionと分離されることを確認する。
- `sincromisor-server/sincro-rtc-pion-poc/`で既存`go test ./...`を実行し、rootで`npm run gate`と
  `npm run tasks:check`を実行する。
- メンテナンス切替後、既存runbookのChrome UI smokeを1回実行する。
- 利用再開後の観測結果をGate 5 artifactへ記録し、未解決critical issueがない場合だけPASSとする。

## ドキュメント同期の要否

要。Pionを現在の正本へ切り替えるため、少なくとも次を実装と同じ変更で同期する。

- `documents/design/architecture/overview.md`
- `documents/design/architecture/runtime-flow.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/backend/services/sincro-rtc.md`
- `documents/design/backend/services/audio-broker.md`
- `documents/design/backend/services/speech-extractor.md`
- `documents/design/backend/services/speech-recognizer.md`
- `documents/design/backend/services/text-processor.md`
- `documents/design/backend/services/voice-synthesizer.md`
- `documents/design/infrastructure/compose.md`
- `documents/design/infrastructure/consul.md`
- `documents/design/index.md`
- `documents/migration/pion/roadmap.md`
- `documents/migration/pion/implementation-phases.md`
- `documents/migration/pion/validation-plan.md`
- `documents/migration/pion/rollout-and-operations.md`
- `documents/migration/pion/phase-4-cutover-runbook.md`
