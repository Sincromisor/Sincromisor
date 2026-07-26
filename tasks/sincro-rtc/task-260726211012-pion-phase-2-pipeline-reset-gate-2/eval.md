# Evaluation: task-260726211012-pion-phase-2-pipeline-reset-gate-2

## attempt 3

### 判定

FAIL

実装品質とGate 2 exitを分離して最終再評価した。

- 実装品質: **FAIL**。attempt 2のExtractor identity、PCM drop count、docs/audit残課題は解消した。
  しかし必須の`go test -race ./...`がoutput backpressure / Close testのchannel send/close raceを検出し、
  race-cleanな受け入れ検証になっていない。
- Gate 2 exit: **FAIL**。実Python 4-serviceは引き続き未観測で、固定commandもorigin不足によりFAILした。
- 全体判定: **FAIL**。

### attempt 2残課題の再評価

- [✓] session-wide Extractor identity — 最後に受理したgeneration/speech/sequenceを
  `Coordinator.extraction`へ保持する。現在generation判定とidentity validationをCoordinator lock下で行い、
  sequence重複/逆行、speech逆行、新generation最初のspeech再利用を現在generationのprotocol resetにする。
- [✓] reset後fixture identity — production WebSocket/codec integrationはPython生成fixtureの
  speech/sequenceだけをgeneric MessagePack mapでstrictly largerへpatchし、全turnの単調増加をassertする。
  Go DTOで成功payloadを作っていない。
- [✓] PCM session累積count — `pcmDrops`をCoordinator lifetimeへ移し、
  `frameQueue`交換後も増加を継続する。service/count-only logのprivacy boundaryも維持する。
- [✓] docs/comment audit — session-owned Extractor identity、generation-local conversation、
  session累積PCM telemetry、protocol failure/resetを実コードと両design文書へ同期した。
  stale commentと新規TODOはない。
- [✓] 既存の4 WebSocket fixture happy path、4×3 reset matrix、simultaneous/8 reset leak、
  generation capture、3 publication windows、output barrier、Close matrixのtestは維持されている。
- [✗] output backpressure / Close race — `TestCloseConvergesDuringResetAndBackpressure/output_timeout`
  はprivate `publishText`を未追跡goroutineで直接起動し、同時に`Close`する。
  `Close`はgeneration/session producerだけをWaitGroupでjoinしてからexternal channelをcloseするため、
  このtest producerを待たず`textOut`をcloseできる。race detectorは
  `runtime.go:193`のchannel sendと`coordinator.go:238`のchannel closeを競合として検出した。
  focused `-count=100`でも再現した。tracked generation producerを通すtestへ直すか、
  channel closeを全publishと同じbarrierで直列化し、race-cleanに契約を証明する必要がある。

### テスト結果

- `npm run gate`: PASS（SHA `ef5aff83`のclean cache record）
    - lint: PASS
    - build: PASS
    - frontend test: 534 passed / 2 skipped
- `npm run tasks:check`: PASS（263 task、open 3 / done 258 / superseded 2）
- module root `gofmt -l .`: PASS（出力なし）
- `GOCACHE=/private/tmp/sincromisor-eval3-gocache go vet ./...`: PASS
- `GOCACHE=/private/tmp/sincromisor-eval3-gocache go test ./...`: PASS
- `GOCACHE=/private/tmp/sincromisor-eval3-gocache go mod tidy -diff`: PASS（差分なし）
- `GOCACHE=/private/tmp/sincromisor-eval3-gocache go test -race ./...`: **FAIL**
    - `TestCloseConvergesDuringResetAndBackpressure/output_timeout`
    - `Close`の`textOut` closeと`publishText`のsendにdata race。
- focused
  `go test -race ./internal/pipeline -run '^TestCloseConvergesDuringResetAndBackpressure/output_timeout$' -count=10`:
  PASS。
- focused同command `-count=100`: **FAIL**。同じsend/close raceを再現した。
- 固定Gate 2 command
  `go test -tags=gate2 -count=1 ./internal/pipeline -run '^TestGate2PythonServices$'`:
  **FAIL**。`SINCRO_GATE2_EXTRACTOR_ORIGIN`の必須validationで失敗し、skipされなかった。
- カバレッジ評価: identity/telemetry修正と既存matrixの観点は十分である。
  ただしtask.mdが必須とするfull raceが失敗し、output timeout/Close経路のtest oracleが
  concurrency contractを安全に再現できていないためPASSにできない。

### ドキュメント整合性

- wire schema、endpoint、production RTC/compose経路の変更はない。
- `audio-pipeline-websocket.md`と`audio-broker.md`はsession-wide identity、
  PCM session累積count、privacy-preserving telemetryへ同期済み。
- migration文書とGate 2 artifactへの導線、Python AudioBrokerがPhase 3までproduction正本である境界、
  実4-service PASSまでPhase 3条件未達である記載は維持されている。
- `artifacts/gate-2-result.md`はattempt 3でもGate 2 FAILを明示し、
  fixture/race検証を実サービスGateの代替扱いにしていない。

### 残課題

- output backpressureとCloseの競合testをtracked generation producer経由へ修正するか、
  external channel closeを`outputMu`等で全publishと直列化し、full raceとfocused反復を通す。
- 必要backendと4 originを用意し、固定Gate 2 commandで4 stage、reset後の2 turn目、
  Close後active connection 0を観測してartifactを更新する。実サービスGateがPASSするまでcloseしない。

## attempt 2

### 判定

FAIL

実装品質とGate 2 exitを分離して再評価した。

- 実装品質: **FAIL**。attempt 1の指摘は大部分が解消されたが、Extractorの
  session-wide sequence/speech単調性がresetを跨いで維持されず、受け入れ条件に適合しない。
- Gate 2 exit: **FAIL**。実Python 4-serviceは引き続き未観測で、固定commandもorigin不足によりFAILした。

### attempt 1残課題の再評価

- [✓] generation capture / stale telemetry — `Activate`時のgenerationをclosureへ捕捉し、
  result/event/outputのstale dropをservice別に計数する。PCM overflowもExtractor名とdrop countだけをlogへ出す。
- [✗] Extractor identity — 同一`conversation`内のspeech ID回帰は拒否するようになったが、
  reset時に`newConversation`で`speechID=-1`、`sequence=-1`へ戻すため、task.mdが要求する
  session内strictly increasingなsequence IDを維持しない。`TestFixtureWebSocketResetMatrix`も
  generation 1と2で同じPython fixtureの`speech_id=42 / sequence_id=7`を再受理しており、
  この不適合を成功条件として固定している。最後に受理したspeech/sequence identityを
  Coordinator lifetimeへ保持し、new generationの最初のExtractorResultにも比較する必要がある。
- [✓] fake 4-service integration — `websocket_integration_test.go`はproduction `SetFactory`、
  production WebSocket clients/codecsと4つの`httptest` serverを通る。6つのPython生成fixtureを読み、
  Processorだけdynamic request identity/historyをgeneric MessagePack map上でpatchし、
  raw Processor bytesのSynthesizer転送まで確認する。
- [✓] reset matrix — 4 service × normal close / malformed frame / remote closeの12 caseで、
  retry、4接続再作成、transient object交換、old output drain/stale drop、history継承、
  post-reset turn、Close後active 0を確認する。
- [✓] simultaneous / leak — 2 service同時failureを8 reset反復し、各回4接続再作成、
  old output 0、Close後active connection 0、goroutine baseline +5以下を有限deadlineで確認する。
  attempt 1のnormal Close 10回testも維持されている。
- [✓] Activate race — Connect return直前、return/Activate間、Activate/running publish間を
  Coordinator testで固定し、attempt数、generation、旧set Close-onceを確認する。
- [✓] output backpressure / barrier / Close — injectable waiterで5秒timeoutを決定論的に発火させ、
  generation +1、buffer drain、既にhandedされたgeneration envelope、channel close ownership、
  reset reconnect中Closeとbackpressure中Closeを確認する。
- [✓] comment audit — `conversation.go`へgeneration state、speech/sequence accumulation、
  outstanding identity、partial user、Processor intermediate/final commitのreader-oriented commentを追加した。
  reset/output/telemetry commentも実コードと一致する。
- [✗] documentation — callback generationとprivacy-preserving stale telemetryは同期された。
  ただし両design文書がPCM overflowを「累積drop count」と記載する一方、
  実装のcountはgeneration-owned `frameQueue.drops`でありqueue交換ごとに0へ戻る。
  session累積にするか「generation内累積」と明記して同期する必要がある。

### テスト結果

- `npm run gate`: PASS（SHA `dbb8d7e6`のclean cache record）
    - lint: PASS
    - build: PASS
    - frontend test: 534 passed / 2 skipped
- `npm run tasks:check`: PASS（263 task、open 3 / done 258 / superseded 2）
- module root `gofmt -l .`: PASS（出力なし）
- `GOCACHE=/private/tmp/sincromisor-eval2-gocache go vet ./...`: PASS
- `GOCACHE=/private/tmp/sincromisor-eval2-gocache go test ./...`: PASS
- `GOCACHE=/private/tmp/sincromisor-eval2-gocache go test -race ./...`: PASS
- `GOCACHE=/private/tmp/sincromisor-eval2-gocache go mod tidy -diff`: PASS（差分なし）
- 固定Gate 2 command
  `go test -tags=gate2 -count=1 ./internal/pipeline -run '^TestGate2PythonServices$'`:
  FAIL。独立評価環境では`SINCRO_GATE2_RECOGNIZER_ORIGIN`の必須validationで失敗し、skipされなかった。
- カバレッジ評価: attempt 1で不足したfixture WebSocket boundary、12 reset matrix、
  simultaneous/repeated reset、publication windows、backpressure/barrier/Closeは十分に改善した。
  ただしreset後に同じExtractor IDを受理するtest oracleがsession invariantと逆であり、PASSにできない。

### ドキュメント整合性

- wire schemaやproduction RTC/compose経路の変更はない。
- `audio-pipeline-websocket.md`と`audio-broker.md`はgeneration capture、stale/PCM drop telemetry、
  privacy boundaryをattempt 2実装へ同期した。
- PCM drop countのlifetimeだけは、文書の「累積」とgenerationごとに交換される実装が一致しない。
- migration文書とGate 2 artifactへの導線、Python AudioBrokerがPhase 3までproduction正本である境界、
  実4-service PASSまでPhase 3条件未達である記載は維持されている。
- `artifacts/gate-2-result.md`はattempt 2でもGate 2 FAILを明示し、fake検証を代替扱いしていない。

### 残課題

- 最後に受理したExtractor speech/sequence IDをsession lifetime stateへ移し、reset後も
  speech ID逆行とsequence ID重複/逆行をprotocol errorとして同じgenerationのresetへつなぐ。
  WebSocket reset testはgeneration 2以降にstrictly largerなfixture identityをpatchして検証する。
- PCM drop countをsession累積にするか、generation内累積という契約へ文書を修正する。
- 必要backendと4 originを用意し、固定Gate 2 commandで4 stage、reset後の2 turn目、
  Close後active connection 0を観測してartifactを更新する。実サービスGateがPASSするまでcloseしない。

## attempt 1

### 判定

FAIL

実装品質とGate 2 exitの両方に、独立したFAIL理由がある。

- 実装品質: generation callback、speech ID検証、fake/reset/race/leak test、comment auditが
  受け入れ条件を満たさない。
- Gate 2 exit: 実Python 4-service環境を実行できず、固定commandがFAILした。fake integrationは
  task.mdの規定どおり代替にならない。

### 受け入れ条件チェックリスト

- [✓] `internal/pipeline`の4指定ファイルとproduction `client/set.go`を追加し、
  Coordinatorがsession state、generation work、client set、queue、confirmed history、
  cancel/joinを所有する — commit `7e446e7f`。
- [✓] `idle / connecting / running / resetting / closed`と許可edgeを
  `generation.go`へ固定し、不正edgeを`TransitionError`と構造化logで拒否する。
- [✗] callbackのgeneration captureとstale drop記録 — `ClientSet.Activate`へ
  `c.onClientEvent`をそのまま渡し、`onClientEvent`がcallback時点の現在generationを読む。
  client set公開時のgenerationをclosureへ捕捉していない。またstale result/eventはdrop件数を
  保持せず、result側logにはservice名もない。task.mdの「全callbackが捕捉generationと現在値を比較し、
  drop countとservice名だけを記録」を満たさない。
- [✓] 初回/partial connect failureは同generationでretryし、runtime failure時だけ
  `requestReset`がgenerationを進める。成功時はattempt loopを終了する。
- [✓] production factoryはExtractor → Recognizer → Processor → Synthesizer順で接続し、
  partial failureを逆順Closeする。
- [✓] runtime failureのsingle-flight reset、入力拒否、generation更新、旧work cancel、
  client close/join、generation work交換、再接続の基本順序を実装する。
- [✓] retry capは1/2/4/8/16/30秒へ飽和し、production jitterは`crypto/rand`、
  waiterはcontext cancel可能である。
- [✓] 640-byte PCMの防御的copy、25-frame drop-oldest queue、reset時のqueue交換を実装する。
- [✗] Extractor protocol validation — `acceptExtraction`はsequence IDをsession内で
  strictly increasingにするが、確定済みspeechの後に未使用の小さいspeech IDが来ても受理する。
  task.mdが要求するspeech ID逆行のprotocol error/resetにならない。
- [✓] Recognizer outstanding identity、partial/confirmed user message、Processorのrequest identity、
  intermediate/final排他、final history commitを実装する。
- [✓] non-empty `voice_text`だけraw ProcessorResultをSynthesizerへ送り、
  typed synthesized outputを公開する。
- [✗] output backpressureの受け入れ検証 — 16件channelと5秒timeoutの実装はあるが、
  fake waiter/hookでtimeoutを進めるtestがない。`outputBackpressure`は直接`time.NewTimer`へ固定され、
  task.md指定のbackpressure reset検証を実施できない構造である。
- [✗] external output barrier/race検証 — `outputMu`とgeneration envelopeは実装したが、
  resetとの競合、旧buffer drain、consumerへ渡した要素、close ownershipを検証するrace testがない。
- [✗] Close/Start lifecycleの基本実装と、normal close 10回、初回connect中Closeは確認できる。
  ただしreset中Close、同時client failure、output backpressure timeoutを含むclose-once matrixはない。
- [✗] fake 4-service automatic integration — `TestCoordinatorRunsFixtureBackedFourStageConversation`
  はWebSocket fake serverではなくGoのin-memory fake clientである。Python生成fixtureを使うのは
  ExtractorResultだけで、Recognizer/Processor/Synthesizer成功値はGo structを直接生成しているため、
  「fake 4-service server」「Go独自schemaで成功を偽装しない」を満たさない。
- [✗] reset integration matrix — 4 service × 3 terminal kindのtestはgenerationとset数だけを確認する。
  各caseでの4 client close、transient queue、old result drop、backoff、再接続後の新発話、
  confirmed history維持、partial user/assistant・in-flight voice非再送を確認していない。
  それらを確認する別testもRecognizer remote-close 1 caseだけである。
- [✗] Activate race — production set testはactivate前/後eventを各1件確認するだけで、
  Connect return直前、return/Activate間、Activate/running publish間をCoordinatorまで含めて
  race検証していない。
- [✗] 実Python 4-service Gate 2 — 固定commandは4 origin未設定でFAIL。
  Extractor/Recognizer/Processor/Synthesizer、reset後の2 turn目、Close後active connection 0は
  artifact上すべて未観測である。
- [✗] leak/race acceptance — normal Close 10回のgoroutine上限だけを確認する。
  各service failure後のreset反復、最終active connection 0、旧generation output 0を有限deadlineで
  検証していない。
- [✗] comment audit — public APIと主要reset/runtime flowには有用なdoc/block commentがある一方、
  `conversation.go`のspeech/sequence/outstanding/history state transitionはコメントがなく、
  impl.mdは「型と関数分割で表現」を追加省略理由にしている。これはtask.mdが明示した
  change comprehension surfaceと、構造改善だけでreader-oriented説明を省略しない条件を満たさない。
- [✗] 全必須検証 — format/vet/unit/race/tidy、repository gate、tasks checkはPASSしたが、
  必須のGate 2 integrationがFAILしたため完了条件全体は未達。

### テスト結果

- `npm run gate`: PASS（指定SHAのclean cache record）
    - lint: PASS
    - build: PASS
    - frontend test: 534 passed / 2 skipped
- `npm run tasks:check`: PASS（263 task、open 3 / done 258 / superseded 2）
- module root `gofmt -l .`: PASS（出力なし）
- `GOCACHE=/private/tmp/sincromisor-eval-gocache go vet ./...`: PASS
- `GOCACHE=/private/tmp/sincromisor-eval-gocache go test ./...`: PASS
- `GOCACHE=/private/tmp/sincromisor-eval-gocache go test -race ./...`: PASS
- `GOCACHE=/private/tmp/sincromisor-eval-gocache go mod tidy -diff`: PASS（差分なし）
- 固定Gate 2 command
  `go test -tags=gate2 -count=1 ./internal/pipeline -run '^TestGate2PythonServices$'`:
  FAIL。`SINCRO_GATE2_EXTRACTOR_ORIGIN`必須validationで失敗し、skipにはならなかった。
- 最初のsandbox内Go実行はlocalhost bindと既定Go cacheへのアクセスを拒否されたため判定に使わず、
  writable cacheとlocalhost socketを許可した同一SHAで再実行した。
- カバレッジ評価: 通常の4-stage happy path、単一reset、service/kindごとのgeneration増加、
  normal close、基本backoffはカバーする。しかし上記fake server、reset matrix、Activate race、
  output barrier/backpressure、failure leakの不足は受け入れ条件に対して重大であり、PASSにできない。

### ドキュメント整合性

- 公開RTC/compose経路の変更はなく、同期対象4文書
  `documents/migration/pion/{roadmap,implementation-phases}.md`、
  `documents/design/contracts/audio-pipeline-websocket.md`、
  `documents/design/backend/services/audio-broker.md`は同一commitで更新されている。
- ただし内容は未同期である。WebSocket契約は「callbackが捕捉generationを再確認」と記載するが、
  実装はcallback時点の現在generationを読む。AudioBroker文書はdrop/resetを構造化logへ出すと記載するが、
  PCM drop countはlogへ出ず、stale drop countも保持しない。実コードに合わせるのではなく、
  task契約どおり実装を直した上で文書と再照合する必要がある。
- Gate 2 artifactへの導線と「実4-service PASSまでPhase 3条件未達」の記載は同期済み。
  `artifacts/gate-2-result.md`もFAILを明示しており、判定の粉飾はない。

### 残課題

- `Activate`時のgenerationをcallback closureへ捕捉し、result/eventのstale drop countとservice名を
  機密payloadなしで記録する。
- Extractorのspeech ID逆行をprotocol errorとしてresetする。
- Python生成fixtureを各wire境界で使うfake 4-WebSocket service integrationへ置き換え、
  4 service × normal/decode/remote、同時failure、backoff、transient破棄、history継承、
  新発話完了までtable-drivenで検証する。
- fake clock/waiterで5秒output backpressureを進め、output barrier、close/reset競合、
  各service failure反復、active connection 0、旧generation output 0をrace/leak testで検証する。
- conversation/state/data flowのreader-oriented commentを補い、定型的なcomment auditを更新する。
- 必要backendと4 originを用意し、固定Gate 2 commandを実行して4 stage、reset後2 turn目、
  Close後active connection 0をartifactへ記録する。実サービスGateがPASSするまでGate 2をcloseしない。
