# Pion Phase 3のproduction candidateを実測してGate 3を判定する

## 背景 / 目的

先行するGate 3 harnessタスクで固定・自己検証したentrypointを使い、実4 Python service、
現行Frontend、Pion serverのproduction経路を縦切りで実測する。
本タスクはharnessやproduction機能を実装せず、固定条件を実行して証拠をartifactへ残し、
`documents/migration/pion/validation-plan.md`に基づいてGate 3をPASSまたはFAILと判定する。

## 完了条件（受け入れ条件）

- [ ] harness taskがAPPROVED仕様どおりPASS済みで、対象commitに未取り込み差分がない。
      固定command、fixture SHA-256、Playwright/Chromium、4 service originを事前確認し、
      欠落時はskipやfake代替をせずGate 3 FAILとする。
- [ ] current Frontendからinitial Offer、candidate、audio input、confirmed user text、
      processor response、合成音声、`text_ch`、`telop_ch`を1往復完走する。
- [ ] 同じbrowser sessionでICE restartし、session ID、DataChannel、pipelineを維持して2往復目を完走する。
      response消失時のinitial/update Offer再送、旧revision candidate、
      404/409/410/429/5xx/timeout分岐も固定harnessで確認する。
- [ ] candidate gathering、pre-connect、media readiness、restart、下流service停止、codec error、
      malformed/oversized HTTP、DataChannel未open、browser abrupt close、managed panicについて、
      expected status/reconnect/close reasonとresource回収を確認する。
- [ ] normal/abnormal closeを各10回行い、active session/WebSocket/codec/queueが0へ戻り、
      各iteration終了後10秒以内にgoroutineがidle baseline+5、fd/socketがbaseline+2以下へ戻る。
      baselineと全iterationのraw countを保存し、1回でも超過すればFAILとする。
- [ ] process強制終了後5秒以内にsupervisorが再起動し、readiness復旧後に新規sessionを受理する。
      1 instanceのsession上限100とprocess停止時の最大session喪失数100をartifactへ明記する。
- [ ] production経路にtest tone、fixed smoke payload、Python RTC adapterがないことをsource/runtime双方で確認する。
- [ ] canonical Gate 3 inventoryについて、依存harnessのscenario ID、production観測点、一意な期待値、
      artifact rowを1対1で記録する。少なくとも次を含み、未観測をPASSにしない。
    - initial Offer single-flight、request ID同一/衝突/tombstone、old/future revision、
      update partial apply/並行candidate、operation別404/409/410/429/5xx/timeout。
    - body/decoded SDP/candidate/candidate queue、speech/text/telop queue、DataChannel payload/属性の
      exact / +1境界。
    - pipeline reset/reconnect、旧generationのrecognition/text/synth/audio/telop非観測、
      backoff中入力非buffer、復旧後new turn。
    - abnormal close時の全pipeline client、codec、PeerConnectionのclose-once、
      pre-connect/media-readiness/restart/close deadline。
    - RTP/RTCP loop終了、packet loss、duplicate/late/reorder drop、NACK、loss/RTT、pacing lag/abort。
    - draining後の新規initial 503、共通5秒close timeout、process restart、session上限。
    - revisionなしaiortc Answerを使うinitial rollback modeと、切断後のnew bundle initial。
- [ ] `artifacts/gate-3-result.md`へ対象commit、環境、service digest、fixture hash、固定command、
      functional stage、signaling/restart、failure injection、resource iteration、supervisor restart、
      managed panicの依存評価証拠、未観測/残リスクを記録する。必須条件が1件でも未観測ならPASSにしない。

## 設計判断（着手前に確定済み）

- harnessのrule、deadline、期待値、artifact schemaは依存タスクの
  `artifacts/harness-contract.md`を正本とし、本タスク中に緩和・変更しない。
- managed panicはobservabilityタスクのinventory別試験について、対象commit、command、test名、
  close reason、process継続結果をartifactへ取り込む。Gate実行時にproduction constructorへfakeを追加しない。
- Gate失敗時も観測済み/未観測とcleanup結果をartifactへ残す。production bug、harness bug、
  environment欠落をFailure classificationで区別するが、いずれも必須条件未達ならGate判定はFAILである。
- harnessまたはproduction変更が必要になった場合、本タスク内で修正しない。
  `task_revision_required`または別の修正タスクとして戻し、変更後の固定commitでGateを最初から再実行する。
- artifactは`gate_3_result: PASS|FAIL`をtask evaluatorのverdictと分離して持つ。
  全固定scenarioを実行し、証拠と集約規則が正しい場合、Gate結果がFAILでも本「測定タスク」の
  evaluator verdictはPASSとしてcloseできる。その場合Phase 4はblockedとし、failure ownerに応じた
  production / harness修正taskを起票する。未実行、証拠欠落、集約誤りはtask evaluator FAILである。

## スコープ境界

- 本タスク: 固定Gate実行、証拠収集、resource/failure判定、Gate 3 artifact、設計文書への判定反映。
- 依存タスク: harness実装と自己検証、Phase 3 production機能。
- スコープ外: harness/production code修正、aiortc baseline、Firefox、NAT/firewall、fixed UDP mux、
  impairment、30分soak、compose切替runbook、運用切替。

## 高リスク統合タスクの追加設計（該当時のみ）

本タスクは高リスクな実測だが、ownership / injection / observation契約はharness taskの
`artifacts/harness-contract.md`をconsumeし、新たな実装判断を持たない。
受け入れ条件とartifact sectionを1対1で対応付け、未観測を空欄や推測で補わない。
`gate_3_result`は全必須rowがPASSの場合だけPASSとし、FAILまたは未観測rowが1件でもあればFAILとする。

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/implementation-phases.md:132-144`がGate 3条件である。
- `documents/migration/pion/validation-plan.md:45-84`がfunctional/pipeline、
  `:199-239`がfailure/resource/observabilityの正本である。
- harness taskの固定entrypoint、README、`artifacts/harness-contract.md`を変更せず使用する。
- Playwright trace、browser capture、音声/本文を含むraw logは
  `work/private-artifacts/task-260802033044-pion-phase-3-production-candidate-gate-3/`へ置く。
  tracked artifactには集計値、sanitized log、SHA-256、再現command、private保管場所だけを記録する。

## テスト

- harnessが定義する固定Gate commandを実4 service origin付きで実行する。
- production candidate commitに対し`go test -race ./...`、`go vet ./...`、
  Frontend lint/typecheck/test/build、root `npm run gate`、`npm run tasks:check`を通す。
- evaluatorはartifactのcommand/log/metricと実出力を照合し、未実行、skip、fake代替、
  resource未収束、harness契約の実行中変更をFAILにする。

## ソースコードコメント受け入れ条件

本タスクはproduction/test harnessを変更しない。実測artifactと設計文書だけを変更するため、
source comment auditは対象外である。実行中にcode/comment変更が必要になった場合は、
本タスクのスコープを逸脱して修正せず、別タスクへ戻す。

## ドキュメント同期の要否

要。`documents/migration/pion/roadmap.md`へGate 3 artifact、`gate_3_result`、Phase 4へ進めるかを記録する。
Gate 3はproduction candidate判定でありstable endpointの切替ではないため、
`documents/design/backend/services/sincro-rtc.md`、`documents/design/architecture/overview.md`、
`documents/design/index.md`のcurrent Python正本はPASS時も変更しない。Pionをcurrent designへ反映するのは
compose/stable endpointを切り替えるPhase 5以降とする。
