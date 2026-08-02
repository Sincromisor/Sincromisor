# Pion Gate 3 本番候補検証ハーネスを実装する

## 背景 / 目的

Pion Phase 3の本番候補に対するGate判定では、実際の4 Pythonサービス、現行Frontend、Pionサーバーを
縦切りで動かし、シグナリング障害、メディア障害、リソース収束、プロセス再起動を再現可能な方法で
観測する必要がある。ハーネス実装とGate実測を同じタスクにすると、ハーネス不具合と本番候補の不具合を
区別できず、評価中に検証仕様を変更する危険がある。

本タスクは固定Gateコマンド、Playwrightブラウザー固定データ、障害注入プロキシ、リソース採取器、
プロセス監督、成果物スキーマを実装・自己検証する。本番候補の実測とGate 3判定は後続タスクで行う。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-server/sincro-rtc-pion-poc` module rootで
      `go test -tags=gate3 -count=1 ./cmd/pion-poc -run '^TestGate3ProductionCandidate$' -v`
      を本番実測専用エントリーポイントとして提供する。4サービスの接続元、Consul実行ファイル、
      ビルド済みFrontend、FFmpeg、管理対象Chromium、固定データのいずれかが欠けた場合はskipや縮退成功にせず、
      欠落項目を示してFAILする。
- [ ] ハーネス自己検証は
      `go test -tags=gate3 -count=1 ./internal/gate3/... ./cmd/pion-poc -run 'HarnessContract' -v`
      で実行する。通信互換な4契約サービスを使い、ハーネスの経路制御、障害注入、
      ブラウザー調停、終了処理を確認するが、本番候補のPASSは返さない。
- [ ] Playwrightハーネスは現行 Frontend の`/simple-vrm/index.html`を管理対象 Chromium で操作し、
      偽音声デバイスを使って初回接続、1往復、ICE restart、2往復目、停止を観測できる。
      本番用シグナリングクライアント、MessagePack codec、メディア処理器をテスト用フェイクへ差し替えない。
- [ ] 現行 Frontend では生成できない`G3-READY-001`の負の接続準備ケースと、ブラウザーUIを必要としない
      `G3-SIG-001`、`G3-OPS-001`、`G3-OPS-003`は、`internal/gate3/boundaryclient/`に置く
      Go 製のテスト専用 WebRTC 境界 client を使う。この client はシグナリングプロキシ経由で本番用
      `offer` / `candidate` endpoint と Pion adapter を実行し、ケースごとに Answer 未適用、
      音声 transceiver だけを持ち RTP packet を送らない状態、`text_ch`または`telop_ch`の欠落を生成する。
      現行 Frontend の互換性を証明する用途には使わず、本番 constructor、Frontend、ブラウザーの
      global objectへテスト接続点を追加しない。
- [ ] シグナリングプロキシは操作単位の有限応答列、パイプラインプロキシはサービス単位の
      `close`、`malformed`、`delay`を提供する。各シナリオ終了時に未消費規則があればFAILし、
      シナリオ間で規則を明示的に初期化する。本番ビルドへ障害注入endpoint、flag、global hookを追加しない。
- [ ] プロセス内Gateエントリーポイントは`runtime.NumGoroutine`、Pion Manager/statuses、
      Prometheus queue gaugeを、子プロセス監督は対象Pion PIDの`/proc/<pid>/fd`とsocket inodeを、
      パイプラインプロキシは所有中の上流・下流WebSocket接続を生の個数で記録する。
      readiness後かつブラウザー・session開始前に250ms間隔で3回基準値を採取し、各リソースの最大値を
      基準値とする。session終了後は250ms間隔、最大10秒間採取し、active session・queue・proxy
      WebSocketが0、goroutineが基準値+5以下、fd・socketが基準値+2以下となるsampleが3回連続した
      時点だけを収束とする。全sampleと終端sampleを成果物へ保存する。
      goroutineはプロセス内Gate testのPID、fd・socketは監督が起動したPion子プロセスのPIDを対象とし、
      socket数は`/proc/<pid>/fd`の`socket:[inode]` symlinkから得た重複なしinode数とする。
      active codec gaugeは本番コードに存在しないため要求せず、codecの終了処理はsession close後の
      goroutine・fd・socket収束と既存codec lifecycle testの対象commit・commandで証明する。
- [ ] プロセス監督はプロセス強制終了、子プロセスの`Wait`、5秒以内の再起動、readiness復旧、
      新session受付を観測し、終了時に子プロセスを残さない。module rootで
      `go build -trimpath -o work/gate3/bin/pion-poc ./cmd/pion-poc`により生成した本番実行ファイルを、
      `work/gate3/bin/pion-poc -http 127.0.0.1:<allocated-port> -frontend-dir <absolute-dist> -ffmpeg <absolute-ffmpeg>`
      で起動する。テスト補助プロセスや`go test`実行ファイルの再起動を本番プロセス再起動の証拠にしない。
- [ ] ハーネス自身の単体テスト・所有者間結合テストで、規則消費順、timeout、終了処理、subprocess join、
      ブラウザー終了、依存欠落時のfail-closed、成果物の必須section検証を固定する。
- [ ] `artifacts/harness-contract.md`に固定コマンド、必要環境、注入語彙、リソース観測点、
      成果物スキーマ、自己検証結果を記録する。本番Gate結果は記録しない。
- [ ] テストハーネスと変更理解範囲について、
      `documents/rules/source-comments.md`所定の全件コメント点検を`impl.md`へ記録する。

## 設計判断（着手前に確定済み）

- 再利用する補助実装は`internal/gate3/`、本番実測エントリーポイントは
  `cmd/pion-poc/gate3_production_test.go`へ置き、どちらも`gate3` build tag限定にする。
  エントリーポイントを`cmd/pion-poc`と同じpackageに置くことで、本番用`runWithBoundaries`をテストプロセス内で
  起動し、同じPIDの`runtime.NumGoroutine`を観測する。本番constructorへフェイク注入を追加しない。
- root `package.json` / `package-lock.json`へ`@playwright/test` 1.54.2をdevDependencyとして固定し、
  `playwright.gate3.config.ts`と
  `sincromisor-frontend/tests/gate3/pionRtcGate3.spec.ts`を追加する。
  準備時は`npx playwright install chromium`、Gate本体は取得済み実行ファイルだけを使用する。
- 外部入力は後述の環境変数に限定し、暗黙の`PATH`探索、ユーザー単位Playwright cache、
  module root以外のcurrent working directoryへ依存しない。相対path、実行不能なbinary、
  schema・SHA-256不一致は依存欠落としてFAILする。
- 4サービスの接続元は
  `SINCRO_GATE3_{EXTRACTOR,RECOGNIZER,PROCESSOR,SYNTHESIZER}_ORIGIN`を必須にする。
  Gateハーネスは`127.0.0.1:8500`が未使用であることを確認後、`consul agent -dev`を同addressで子プロセス起動する。
  4 proxyをephemeral portでlistenし、接続元を上流として
  `SpeechExtractor|SpeechRecognizer|TextProcessor|VoiceSynthesizer`の4名を専用Consulへ登録する。
  Pionが各proxyへ接続したことをConsul health queryとproxy connection countの双方で確認する。
  終了処理はPion停止、サービス登録解除、proxy join、Consul terminate/Waitの順とし、
  既存Consulや登録を退避・上書きしない。port使用中はfail-closedとする。
- 音声固定データは固定文から生成し、`internal/gate3/testdata/README.md`へ
  engine・version・speaker・license・privacy、生成command、SHA-256を記録する。認識文の完全一致ではなく、
  確定済みかつ空でない利用者テキストと後段の空でない出力を観測する。
- Firefox、NAT、通信品質劣化、30分soak、本番compose切替はPhase 4へ残す。

### 外部入力とパス解決

固定コマンドは`go.mod`が存在するmodule rootからだけ実行可能とし、repository rootは正規化した
`../../..`で一意に解決する。次の入力を開始時に全件検査し、未設定、相対パス、実体欠落、実行権限欠落、
想定外versionのいずれかがあれば、子プロセスやlistenerを作る前にFAILする。repository所有の入力は
repository外へ解決されるsymlinkも拒否する。ホスト実行ファイルはrepository外を許容するが、
symlinkを解決した実体の絶対pathとversionを成果物へ記録する。

| 入力                 | 解決規則                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4サービス接続元      | `SINCRO_GATE3_{EXTRACTOR,RECOGNIZER,PROCESSOR,SYNTHESIZER}_ORIGIN`。`ws://`または`wss://`の絶対URLだけを受理する                                       |
| Consul               | `SINCRO_GATE3_CONSUL_BINARY`で指定した絶対実行ファイル。`version`を実行して記録する                                                                    |
| FFmpeg               | `SINCRO_GATE3_FFMPEG_BINARY`で指定した絶対実行ファイル。Pionの`-ffmpeg`にも同じpathを渡す                                                              |
| Go                   | `SINCRO_GATE3_GO_BINARY`で指定した絶対実行ファイル。親testをbuildしたGoと同じmajor / minor versionだけを受理する                                       |
| Node.js              | `SINCRO_GATE3_NODE_BINARY`で指定した絶対実行ファイル。major version 18以上だけを受理し、完全なversionを記録する                                        |
| Chromium             | `SINCRO_GATE3_CHROMIUM_BINARY`で指定した絶対実行ファイル。Playwrightが同pathを`executablePath`として使う                                               |
| Frontend             | repository内の`sincromisor-frontend/dist`固定。`simple-vrm/index.html`と参照assetが存在し、開始時に全体SHA-256 manifestを作る                          |
| Playwright runner    | repository内の`node_modules/@playwright/test/cli.js`と`playwright.gate3.config.ts`固定。`@playwright/test` 1.54.2以外はFAILする                        |
| 音声固定データ       | repository内の`internal/gate3/testdata/gate3-input.wav`固定。README記載のSHA-256と一致させる                                                           |
| 本番実測の非公開出力 | repository内の`work/private-artifacts/task-260802033044-pion-phase-3-production-candidate-gate-3/gate3-run.json`固定。既存ファイルは上書きせずFAILする |
| 自己検証出力         | `t.TempDir()`配下だけを使い、schema検証後にテスト所有者が削除する                                                                                      |

環境変数で上記pathや成果物出力先を別の場所へ差し替える余地は設けない。環境変数にするのは、
ホストごとに絶対pathが変わる4サービス接続元と5実行ファイルだけである。

### シグナリング経路とGo–Playwright契約

Chromiumが接続する唯一のoriginはGoハーネス所有のHTTP reverse proxyとする。proxyは現行 Frontend 配信、
`config.json`、statuses、metricsをPionへ透過し、相対URLで返る`offer` / `candidate`も同じproxyを通す。
障害規則はこの2 endpointのrequest / responseだけへ適用し、Pionが受理するrequest bodyと返したresponseを
byte単位で台帳へ記録する。ChromiumからPionのlisten addressへ直接接続する経路、現行 Frontend への
global hook、Playwrightのroute.fulfillによるシグナリング差し替えは禁止する。Pionから下流への経路は
`Pion → サービス別WebSocket proxy → 実サービスまたは契約サービス`に固定する。

テスト専用 WebRTC 境界 client も同じHTTP reverse proxyだけに接続し、proxyを迂回してPionへ直接
アクセスしてはならない。clientは本番用HTTP request / response schemaとICE candidate送信を再実装せず、
リポジトリ内の契約型・固定データを使う。ただし、PeerConnection、transceiver、DataChannelの構成だけは
負の接続準備ケースに必要な最小構成を直接生成する。proxyのHTTP台帳、Pionのstatuses / metrics、
下流接続数、終了時のリソースsampleを合否の正本とし、client内部状態だけでPASSにしない。

Goはシナリオごとに権限`0600`の入力JSONと出力先pathを一時directoryへ作り、次の固定commandで
Playwrightを1子プロセス起動する。

`<node> <repo>/node_modules/@playwright/test/cli.js test --config <repo>/playwright.gate3.config.ts --grep '^<scenario-id>$'`

入力JSONは`SINCRO_GATE3_BROWSER_INPUT`、出力JSONは`SINCRO_GATE3_BROWSER_OUTPUT`で絶対pathを子プロセスへ渡す。
stdinはcloseし、stdout / stderrは診断logとして保存するが制御protocolには使わない。両JSONは
`schema_version=1`とし、入力は`scenario_id`、`base_url`、`chromium_executable`、`audio_fixture`、
`deadline_ms`、期待する操作列を必須にする。出力は同じ`scenario_id`、`status`、session ID列、
接続状態列、DataChannel open/受信、確定利用者テキスト、応答テキスト、音声再生、ICE restart、
停止完了の各観測時刻を必須にする。未知fieldは許容するが、必須field欠落、ID不一致、期限超過、
非0終了、出力JSONの複数生成はFAILとする。Goがproxy規則消費、Pion metrics、resource sampleと突き合わせ、
ブラウザーの自己申告だけでPASSにしない。

### Gate 3標準シナリオ台帳

`TestGate3ProductionCandidate`と`artifacts/harness-contract.md`は次のIDを正本とする。
「ライブ（Frontend）」は固定コマンド内で実サービス・現行 Frontend・本番Pion境界を実行する。
「ライブ（境界 client）」は実サービス・テスト専用 WebRTC 境界 client・本番Pion境界を実行し、
現行 Frontend の証拠には数えない。
「既存試験証拠」は対象commitで固定command / test名を再実行し、観測値を成果物へ取り込む。
台帳の各行を成果物の1 rowへ対応させ、matrixは`<scenario-id>/<case-id>`へ展開する。
未実行、skip、証拠の対象commit不一致、期待値不一致は`NOT_OBSERVED`または`FAIL`であり、PASSへ集約しない。

| シナリオID        | 検証層                 | 対象と一意な期待値                                                                                                    | 成果物の主な観測点                                         |
| ----------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `G3-FUNC-001`     | ライブ（Frontend）     | config、初回Offer、candidate、音声、`text_ch` / `telop_ch`、1往復、同一sessionでICE restart、2往復を完走              | HTTP台帳、browser event、2 turn transcript、session ID     |
| `G3-SIG-001`      | ライブ（境界 client）  | candidate gathering timeoutは504、未完成Answerをcacheせずsession close                                                | status、close reason、cache / session metric               |
| `G3-SIG-002`      | 既存試験証拠 | initial request IDの同一再送・並行single-flightは同一Answer、異なるSDP再利用は409、tombstoneは410                     | test名、request identity、status、session作成数            |
| `G3-SIG-003`      | 既存試験証拠 | candidate / end-of-candidatesを受理し、不明session、late、旧・未来revisionを新sessionへfallbackせず拒否               | revision、status、session作成数                            |
| `G3-SIG-004`      | 既存試験証拠 | update Offerとcandidateをsession単位で直列化し、並行updateは409、失敗revisionを進めずpending candidateを適用しない    | revision遷移、status、pending件数                          |
| `G3-SIG-005`      | ライブ（Frontend）     | response drop、404、409、410、429、5xx、delayを下記有限応答列どおりretry・replacement・terminalへ分岐                 | proxy消費列、body hash、request ID、revision、試行数       |
| `G3-LIMIT-001`    | 既存試験証拠 | HTTP body、decoded SDP、candidate文字列・件数・pending queueをexact limitで受理し、`limit+1`を所定statusで拒否        | limit名、入力値、status、close有無                         |
| `G3-LIMIT-002`    | 既存試験証拠 | speech / text / telop queueとDataChannel payloadをexact limitで受理し、`limit+1`をdropまたはclose契約どおり処理       | queue名、gauge、drop metric、close reason                  |
| `G3-READY-001`    | ライブ（境界 client）  | pre-connect、ICE / DTLS、audio track、必須DataChannel、media readiness、restartの各deadlineでsession closeし下流接続0 | deadline名、status、close reason、resource terminal sample |
| `G3-PIPE-001`     | ライブ（Frontend）     | 4実サービスで2 turnを完走し、下記MessagePack操作台帳と一致                                                            | proxy transcript、identity、history、voice format          |
| `G3-PIPE-002`     | ライブ（Frontend）     | 4サービス×`close`・`malformed`・`delay`で同session再接続、旧generation出力なし、backoff中入力非buffer、復旧後new turn | reconnect metric、generation、proxy count、browser event   |
| `G3-CODEC-001`    | ライブ（Frontend）     | 壊れたvoice containerでdecode metric増加、`codec_error` close、全queue・接続収束                                      | codec metric、close reason、resource sample                |
| `G3-CLOSE-001`    | ライブ（Frontend）     | normal closeを10回行い、各回10秒以内に収束                                                                            | iteration別sample、close count                             |
| `G3-CLOSE-002`    | ライブ（Frontend）     | browser abrupt closeを含むabnormal closeを10回行い、全client・codec・PeerConnectionを各1回closeして収束               | close-once証拠、iteration別sample                          |
| `G3-MEDIA-001`    | 既存試験証拠 | RTP / RTCP loop終了、loss、duplicate / late / reorder drop、NACK、loss / RTT、pacing lag / abortを固定試験で観測      | test名、metric delta、loop join                            |
| `G3-OPS-001`      | ライブ（境界 client）  | draining後の新規initialは503、共通5秒期限でactive sessionを終了                                                       | status、drain時刻、close duration                          |
| `G3-OPS-002`      | ライブ（Frontend）     | 本番実行ファイルを強制終了し、`Wait`後5秒以内に再起動、readiness復旧、新session受付                                   | old/new PID、exit、ready時刻、new session                  |
| `G3-OPS-003`      | ライブ（境界 client）  | 1 instance上限100で101件目だけ429、最大喪失数100を記録                                                                | active最大値、101件目status、喪失数                        |
| `G3-PANIC-001`    | 既存試験証拠 | 管理対象HTTP handler、Pion callback、media / pipeline goroutineのpanicを各境界で回収し、所定closeまたはprocess継続    | inventory、test名、close reason、process状態               |
| `G3-ROLLBACK-001` | 既存試験証拠 | revisionなしaiortc Answerのinitial rollback modeと、切断後new bundle initialが成立                                    | mode、revision有無、旧・新session ID                       |

既存試験証拠は本番実測エントリーポイント自身が次の子コマンドを対象commitのclean treeで実行する。
Go commandは`SINCRO_GATE3_GO_BINARY`を使い、`-json` eventから指定testの`pass`を全件確認する。
Frontend commandは`SINCRO_GATE3_NODE_BINARY`でrepository内`node_modules/vitest/vitest.mjs`を起動する。
指定testが0件、skip、非0終了、未committed source、実行前後のHEAD不一致は該当scenarioをFAILにする。

#### `G3-SIG-002`

```console
go test -count=1 -json ./internal/signaling -run '^(TestOfferRegistrySingleFlightAndConflict|TestOfferRegistryCapacityTombstoneAndExpiry)$'
```

#### `G3-SIG-003`

```console
go test -count=1 -json ./internal/rtc -run '^(TestRevisionCandidateDedupeAndLimit|TestManagerRejectsOldAndFutureCandidatesBeforePionApply|TestManagerConnectionDataChannelsAndClose)$'
```

#### `G3-SIG-004`

```console
go test -count=1 -json ./internal/rtc -run '^(TestRevisionUpdateIdentityAndRetry|TestUpdateAndCandidateOperationsAreSerialized|TestUpdateFailureAfterRemoteApplyClosesWithoutCachingAnswer)$'
```

#### `G3-LIMIT-001`

```console
go test -count=1 -json ./internal/signaling ./internal/rtc -run '^(TestRequestBodyBoundary|TestInitialOfferSchemaAndByteBoundaries|TestCandidatePresenceSizeAndRevisionBoundaries|TestRevisionCandidateDedupeAndLimit)$'
```

#### `G3-LIMIT-002`

```console
go test -count=1 -json ./internal/media ./internal/rtc ./internal/pipeline/client -run '^(TestOutputSpeechQueueBoundaries|TestDataChannelQueueOverflowPolicies|TestDataChannelTextJSONSchemaAndSizeBoundary|TestOutboundLimitClosesConnectionWithTypedEvent|TestReadLimitClassification)$'
```

#### `G3-MEDIA-001`

```console
go test -count=1 -json ./internal/media ./internal/rtc ./internal/observability -run '^(TestInputProcessorOrderingAndTelemetry|TestRTCPClassificationQualityAndUnknownFeedback|TestOutboundSchedulerDropCreatesProductionRTPClockGap|TestOutboundSpeechAbortCreatesProductionRTPClockGap|TestOutputSpeechLagBoundaryAbortOrderAndNextCadence|TestRegistryExposesFixedSchemaWithoutPayloadLabels)$'
```

#### `G3-PANIC-001`

```console
go test -count=1 -json ./internal/signaling ./internal/rtc ./internal/media ./internal/pipeline ./internal/pipeline/client -run '^(TestMutationPanicClosesKnownSessionAndReturns500|TestMutationPanicAfterPartialResponseDiscardsBodyAndClosesSession|TestSessionRecoverWrappersConvergeOnCloseOnce|TestDataChannelWorkerMetricsAndPanicBoundary|TestInputObserverPanicClosesAndJoinsSession|TestCoordinatorWorkerPanicUsesConfiguredSessionBoundary|TestConnectionWorkerStagesRecoverAsTerminalPanic)$'
```

#### `G3-ROLLBACK-001`

```console
<node> <repo>/node_modules/vitest/vitest.mjs run <repo>/sincromisor-frontend/src/features/rtc/__tests__/rtcNegotiationStateMachine.test.ts <repo>/sincromisor-frontend/src/features/rtc/__tests__/rtcBoundarySchema.test.ts <repo>/sincromisor-frontend/src/features/rtc/__tests__/rtcTalkClient.test.ts --reporter=json --outputFile=<private-work>/rollback-vitest.json
```

全テストのPASSとrevisionなしinitial Answer、rollback mode、切断後replacementのassertion名を保存する。

### 成果物スキーマと集約

`gate3-run.json`は`schema_version=1`とし、`metadata`、`dependencies`、`scenario_results`、
`resource_baselines`、`resource_samples`、`terminal_samples`、`pipeline_transcripts`、
`process_restarts`、`evidence_references`、`cleanup`、`aggregate`を必須sectionとする。
各`scenario_results` rowは`scenario_id`、`case_id`、`mode`、`status`（`PASS|FAIL|NOT_OBSERVED`）、
`started_at`、`finished_at`、`expected`、`observed`、`evidence_refs`、`cleanup_status`を必須にする。
`mode`は`live_frontend`、`live_boundary_client`、`existing_test_evidence`のいずれかに固定し、
`G3-READY-001/pre-connect-close`、`answer-held`、`audio-no-rtp`、`missing-text-ch`、
`missing-telop-ch`は`live_boundary_client`、`restart-deadline`は`live_frontend`でなければFAILする。
既存試験証拠は`commit`、`command`、`test_name`、`exit_code`、観測値を必須とし、対象commitと
`metadata.commit`が一致しなければFAILする。生の音声、会話本文、Playwright traceは非公開出力だけに置き、
tracked成果物にはsanitized集計、SHA-256、再現command、非公開保管pathだけを記録する。

`aggregate.gate_3_result`は`FAIL > NOT_OBSERVED > PASS`の優先順で集約する。FAILが1件でもあればFAIL、
FAILがなく`NOT_OBSERVED`が1件でもあればNOT_OBSERVED、全標準rowがPASSの場合だけPASSとする。
終了処理失敗は元のscenario結果にかかわらずFAILへ上書きする。
ハーネス自己検証では同じschemaへ`aggregate.harness_contract=PASS|FAIL`だけを記録し、
`gate_3_result` fieldを出力してはならない。

## スコープ境界

- 本タスク: Gate 3ハーネス、ブラウザー固定データ、テスト専用 WebRTC 境界 client、障害注入proxy、
  専用Consul、リソース採取器、プロセス監督、成果物検証器、自己検証。
- 依存タスク: 本番RTC・pipeline・Frontend・observabilityの機能と契約は変更しない。
- 後続タスク: 実際の4サービスを使う本番候補実測、成果物作成、Gate 3のPASS / FAIL判定。
- スコープ外: 本番コード変更、本番不具合修正、Gate 3判定、Phase 4のnetwork / soak / rollout。

## 高リスク統合タスクの追加設計

本タスクは複数のプロセス、ブラウザー、障害注入、リソース境界をまたぐため、高リスク統合タスクとして扱う。
ハーネス、観測器、成果物検証器は同じ標準シナリオIDと所有権を共有するため、別タスクへ分割すると
検証契約の変更を独立に許してしまう。本タスクでは実装と自己検証までを一つの変更束とし、実測だけを後続へ分離する。

### 所有権と終了処理

| リソース                      | 生成者                   | 通常時の所有者    | 終端時の終了処理・観測                                                   |
| ----------------------------- | ------------------------ | ----------------- | ------------------------------------------------------------------------ |
| Chromium / Playwright context | Go Gate子プロセス        | Playwright runner | page・context・browserをcloseし、Go側がsubprocess join                   |
| WebRTC 境界 client            | Go Gate test             | Gateシナリオ      | PeerConnectionとDataChannelをcloseし、候補送信workerをjoin               |
| シグナリング・pipeline proxy  | Go Gate test             | Gateシナリオ      | rule waiter解放、listener close、goroutine join                          |
| 専用Consul                    | Go Gate test             | Gate環境          | サービス登録解除後にterminate / Wait                                     |
| Pionプロセス内server          | `cmd/pion-poc` Gate test | Gateシナリオ      | 本番shutdownを呼びManager・Offer・sessionをjoin                          |
| Pion子プロセス                | Gateプロセス監督         | プロセス監督      | killまたはgraceful stop後にWaitし、旧handleを再起動processへ持ち越さない |
| リソースsample                | 採取器                   | Gate iteration    | raw snapshotを成果物writerへ値copyし、runtime resourceを保持しない       |

### シグナリング注入と期待する観測

| 操作・注入                                 | ハーネスの動作                         | 本番境界で期待する観測                                |
| ------------------------------------------ | -------------------------------------- | ----------------------------------------------------- |
| initial / update / candidate response drop | 最初のresponseだけ破棄後に透過         | 同じserialized body、request ID、revisionで再送し成功 |
| update / candidate 404・410                | 最初のresponseだけ指定status後に透過   | 旧session IDを持つnew bundle initialへreplacement     |
| initial 410                                | 最初のresponseだけ410                  | terminal、replacementなし                             |
| 全操作の409                                | 最初のresponseだけ409                  | terminal、blind retry / replacementなし               |
| initial / update / candidate 429・5xx      | 4 responseすべてを指定status           | 4回目でterminal、5回目なし、全実行で同じidentity      |
| initial / update response delay            | 全responseを各実行timeoutより長くdelay | 30秒総期限内3実行でterminal、同じidentity             |
| candidate response delay                   | 全responseを5秒より長くdelay           | 最大4実行でterminal、同じidentity                     |

### 接続・終了シナリオの注入方法

本番constructorへテスト用接続点を追加せず、通常の Frontend シナリオとテスト専用 WebRTC 境界 clientを
次のとおり使い分ける。注入操作自体が成立しなかった場合は期待するtimeoutやcloseを推測せず、そのcaseをFAILにする。

| case ID                          | 実行主体           | 注入方法                                                                                              | 期待する観測                                          |
| -------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `candidate-gathering`            | WebRTC 境界 client | Pionをcase専用の到達不能UDP STUN listenerへ向け、listenerでrequest受信後も応答しない                  | gather timeout、HTTP 504、session / cache収束         |
| `pre-connect-close`              | WebRTC 境界 client | Offer送信直後にPeerConnectionをcloseする                                                              | pre-connect deadline、pipeline接続0                   |
| `answer-held`                    | WebRTC 境界 client | OfferのHTTP応答を受け取るがAnswerをremote descriptionへ適用せず保持する                               | ICE / DTLS deadline、pipeline接続0                    |
| `audio-no-rtp`                   | WebRTC 境界 client | 音声transceiverを持つOfferを送り、接続後もRTP packetを送らない                                       | audio readiness timeout、pipeline接続0                |
| `missing-text-ch`                | WebRTC 境界 client | `telop_ch`だけを作り`text_ch`を作らない                                                               | `text_ch`を伴うDataChannel readiness timeout          |
| `missing-telop-ch`               | WebRTC 境界 client | `text_ch`だけを作り`telop_ch`を作らない                                                               | `telop_ch`を伴うDataChannel readiness timeout         |
| `restart-deadline`               | 現行 Frontend      | 接続済みsessionでupdate Offerのresponseを期限超過までproxy保留し、ICE restartを完了させない           | 同じsession IDのrestart deadline close                |
| `browser-abrupt-close`           | 現行 Frontend      | browser processを強制終了し、page / contextの通常close callbackを通さない                             | abnormal close、close-once、resource収束              |
| `draining-new-initial`           | WebRTC 境界 client | Pion子プロセスへSIGTERMを送り、draining観測後にproxy経由で新規initialを送る                           | 新規initial 503、既存sessionは共通5秒期限内にclose    |

### パイプライン障害と期待する観測

各サービスについて`close`は最初のactive WebSocketをclose、`malformed`は最初のserver→client binary resultを
不正なMessagePackへ置換、`delay`は最初のserver→client resultを35秒保留する。いずれも
`PipelineReconnect(service,start)`、旧generation出力の非観測、同じsessionの維持、
proxy透過後の`success`と次turn完走を期待する。session closeは合格値にしない。

別caseのcodec errorはVoiceSynthesizerのMessagePack envelopeを有効なままvoice containerだけを破損させ、
`sincro_rtc_codec_errors_total{direction="decode_synth"}`増加、`reason=codec_error`のsession close、
全queue・proxy接続の収束を期待する。

### 検証レイヤ

`HarnessContract`は通信互換な契約サービス、専用Consul、4 proxy、本番Pionプロセス、
現行 Frontend、管理対象Chromium、テスト専用 WebRTC 境界 clientを接続する。現行 Frontend で経路制御、
1往復、ICE restart、2往復、代表障害、終了処理を確認し、境界 clientで音声未送信と必須DataChannel欠落を
自己検証する。契約サービスは次の操作台帳を接続ごとに検証し、本番Pion / Frontendを差し替えない。
境界 clientを使った結果は本番Pionの接続準備・終了処理の証拠に限定し、現行 Frontend の証拠へ流用しない。
実際の4 Pythonサービス・imageを使う`TestGate3ProductionCandidate`だけが後続Gate判定の証拠になる。

| サービス         | client → service                                                                                                                 | service → client                                                                                                                                 | 接続内の順序・再接続・turn状態                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SpeechExtractor  | 接続直後の`extractor_initialize.msgpack`と同じkey/typeを持つinitializeを1回、その後16 kHz mono s16le PCM binary                  | PCMごとに`extractor_result.msgpack`のschemaを保ち、turnごとに一意な`speech_id` / `sequence_id`へpatchしたresult                                  | reconnectした新接続でもinitializeを先頭に要求する。service側connection stateはresetするが、scenario transcript上のIDは重複させない                                |
| SpeechRecognizer | 直前のExtractor resultとbyte decode後に同値な`speech_id` / `sequence_id` / voice metadataを持つrequest                           | `recognizer_result.msgpack`のschemaを保ち、入力と同じidentityへpatchしたresult                                                                   | 各requestに1 response。reconnect後もscenario transcriptのidentityを維持し、旧connectionのresponseを送らない                                                       |
| TextProcessor    | `text_processor_request.msgpack`と同じkey/type、現在のsession/sequence、confirmed user message、前turnまでのhistoryを持つrequest | `text_processor_result.msgpack`のschemaを保ち、同じsession/sequence/request message、response追加済みhistory、`end_of_response=true`を持つresult | turn 1からturn 2でrequest historyが前turnのuser/assistant分だけ増えることを検証する。reconnectでhistoryをservice内補完せず、Pionから再送されたrequestを正本にする |
| VoiceSynthesizer | 直前にTextProcessorが返したMessagePack binaryとbyte単位で同一のrequest                                                           | `voice_synthesizer_result.msgpack`と同じschema・有効なvoice containerを持つresult                                                                | 各requestに1 response。reconnect後に旧requestのresponseを送らず、次turnのprocessor resultだけを受理する                                                           |

全操作はbinary frameのみを受理し、余分なframe、順序違反、固定データのschema / type不一致、sessionまたは
identity不一致、未消費request / responseがあれば`HarnessContract`をFAILする。2 turnと障害後再接続の
transcriptを成果物へ保存し、単なる空でない出力を通信互換性の証拠にしない。

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/implementation-phases.md:132-143`がGate 3条件である。
- `documents/migration/pion/validation-plan.md:45-84`がfunctional/pipeline、
  `:199-239`がfailure injectionとobservabilityの正本である。
- `sincromisor-server/sincro-rtc-pion-poc/cmd/pion-poc/main.go:131-147`は
  `http://127.0.0.1:8500`のConsul resolverを使うため、専用Consulへproxyを登録する。
- `sincromisor-server/sincro-rtc-pion-poc/internal/config/config.go:43-109`のFrontend、FFmpeg、
  HTTP/STUN/session/cache設定をproduction起動条件として使う。
- `sincromisor-frontend/src/features/rtc/rtcSignalingHttp.ts:65-115`の最大4 executionと
  `rtcTalkClient.ts`のoperation別replacementをsignaling matrixの正本とする。
- `sincromisor-frontend/src/features/rtc/rtcPeerConnectionFactory.ts:24-59`と
  `rtcDataChannels.ts:25-75`は音声trackと2 DataChannelを常に生成する。この本番経路は変更せず、
  負の接続準備ケースだけを`internal/gate3/boundaryclient/`へ分離する。
- `sincromisor-server/sincro-rtc-pion-poc/internal/observability/registry.go:107-137`の固定metricと、
  Gate test process内のManager/runtime観測をresource evidenceに使う。
- Gate 2の実service entrypointと記録方式は
  `tasks/sincro-rtc/task-260726211012-pion-phase-2-pipeline-reset-gate-2/artifacts/gate-2-result.md`
  を参考にするが、Gate 2結果をGate 3の代替にしない。

## テスト

- 接続元、Consul、ビルド済みFrontend、FFmpeg、Chromium、固定データの欠落、proxy応答列、deadline、
  subprocess / browser終了処理、成果物schemaをfocused testで検証する。
- `internal/gate3/boundaryclient/`の単体テストで、通常構成、Answer未適用、音声RTP未送信、
  `text_ch`欠落、`telop_ch`欠落の5構成が意図したSDPとDataChannelだけを生成すること、
  reverse proxy以外へ接続できないこと、終了時にPeerConnection・DataChannel・候補送信workerを
  すべてjoinすることを固定する。
- 管理対象Chromiumを使う`HarnessContract`で本番Frontend / Pion adapter後のシナリオ調停と
  終了処理を確認する。同じ`HarnessContract`で境界 clientの5構成を本番Pion adapterへ通し、
  statuses、metrics、下流接続0、リソース収束まで確認する。実際の4 PythonサービスによるGate判定は行わない。
- module rootで`go test -race -tags=gate3 ./internal/gate3/...`と
  `go test -race -tags=gate3 ./cmd/pion-poc -run 'HarnessContract'`を別々に実行する。
  本番実測専用`TestGate3ProductionCandidate`をrace自己検証で起動しない。
  さらに`go vet -tags=gate3 ./...`、通常tagなしの`go test ./...`と`go vet ./...`、
  Frontend lint・typecheck・test・build、root `npm run gate`、`npm run tasks:check`を通す。

## ソースコードコメント受け入れ条件

- 本番コードは変更しない。テストハーネスと、その理解に必要な直接の
  補助関数、状態、event、生存期間、データ変換を変更理解範囲として全件点検する。
  `impl.md`は`パス`、`シンボル・処理群・判断`、`種類`、`現在のコメント`、`読者の疑問`、
  `読者に必要な知識`、`判断`、`対応または省略理由`、`レビュー担当者メモ`の9列を持ち、
  固定件数の抽出確認で未確認対象を完了扱いにしない。
- public API・境界は目的、入力、観測可能な出力、失敗、副作用、非対象を説明する。
  Gate調停、障害注入、状態、event、データの流れは処理段階、本番コードへ混入しない境界、
  終了処理の所有者を局所的に理解できるコメントにする。
- `private`、短さ、型、test、既存のコメント欠落を省略理由にせず、弱いコメント・古いコメントは
  書き直すか削除する。module commentの一括追加、定型的な点検理由、無意味な逐語コメントで代替しない。
  コメント前に命名、型、関数分割、options object、module境界を検討するが、それを説明省略理由にしない。
  TODOには理由、削除条件、正規task ID、期限または判断基準を必須とする。
- 評価担当は全変更対象と変更理解範囲を実コードへ照合し、未照合範囲と残リスクを
  `eval.md`へ記録する。読者の疑問を解決しない定型コメント、所有権・終了処理・内部処理の流れの不足、
  古いコメント、不十分な省略理由が1件でもあればFAILとする。

## ドキュメント同期の要否

要。ハーネス利用方法、必要環境、固定command、非対象を`internal/gate3/README.md`へ記録し、
`documents/migration/pion/validation-plan.md`からハーネスタスクと後続Gate判定タスクへ導線を追加する。
Gate 3判定前なので現行設計のPython / Pion正本は変更しない。
