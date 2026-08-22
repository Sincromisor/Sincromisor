# レビュー: task-260822233904-pion-phase-5-maintenance-cutover

## 判定

APPROVED

## 理由・申し送り

- Gate 4 PASS、roadmap / 実装フェーズのPhase 5、stable endpointの `RTCSignalingServer` 登録、既存の停止切替・forward-fix契約を根拠にした最小の本番切替taskである。aiortcを運用rollback先にせず、Phase 6の削除を明確に除外している。
- Gate 5は既存のChrome UI smoke、readiness、`/statuses`、metrics / logを再利用する。根拠のない日数、traffic量、成功率、soak、browser matrixを必須化しておらず、観測終了はPhase 6着手を利用者が判断するまでのopen状態としている。
- 問題時の証拠保存、private artifactの扱い、forward-fix task、PASSにしない条件が明確である。公開契約を維持するため、compose / env / Consul / current designの同期先も示されている。
- 利用者確認により、aiortcは`aiortc` profileへ構成だけ残して動作確認せず、このホストと`work/vps.md`のstaging VPSを連携検証環境として操作できる。未確定だった運用権限とprofile選択は解消した。

## 自律補完

- `AUTO_FIX` 現行の `docker compose --env-file examples/compose.env --profile rtc config` は、`sincro-rtc` がprofile外の `service-initializer` に依存するため無効である。通常 `full` / `rtc` をPionだけにする受け入れ条件から一意に、aiortcを診断profileへ移し、PionとそのConsul依存を `rtc` からも解決可能にして、両profileの `config --services` でPionだけがRTC backendとなることを確認する。
- `AUTO_FIX` Gate判定の正本である `documents/migration/pion/validation-plan.md` にPhase 5 / Gate 5の最小判定と、移行必須条件を観測できない場合はPASSにせず `blocked` とする規則を同期する。実運用手順を更新する `phase-4-cutover-runbook.md` も、aiortc診断をGate判定・rollback経路に戻さないPhase 5手順へ同期する。
- `AUTO_FIX` 現在設計の同期では、列挙済み文書に加え、現行経路を `AudioBroker` と記載する4下流service文書（speech-extractor / speech-recognizer / text-processor / voice-synthesizer）をGo pipeline coordinatorの通常経路に合わせる。Python実装・診断設定の削除はPhase 6へ残す。
- `AUTO_FIX` Pionのtest commandはrootではなく `sincromisor-server/sincro-rtc-pion-poc/` のGo moduleで実行する。既存repository testを再利用するだけで、Gate専用harnessは追加しない。
