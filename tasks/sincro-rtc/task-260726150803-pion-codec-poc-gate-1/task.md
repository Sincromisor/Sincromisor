# Pion / codec PoCでGate 1を判定する

## 背景 / 目的

`documents/migration/pion/roadmap.md` の Phase 1 は、現行 Python / aiortc 実装を本番経路で置換する前に、
Pion、Opus codec、media clock、ICE restart、資源回収という主要リスクを小さな実装で検証する段階である。
現行 frontend は Trickle ICE と同一 `session_id` を使う再 Offer を実装しているが、initial Offer の冪等性、
candidate generation、half-trickle Answer、有限 deadline は契約化されていない。

本タスクでは独立した Go PoC と必要最小限の frontend signaling 拡張を実装し、Phase 0 の同一 scenario と比較して
Gate 1 の `PASS` / `FAIL` を一意に判定する。`PASS` の場合は Phase 2 に引き渡す Pion / codec / ICE / media
方式を ADR に固定し、`FAIL` の場合は本番実装へ進まず、GStreamer `webrtcbin` または aiortc 継続の再評価条件を
記録する。ここでの `PASS` は「Phase 2 へ進める」という判断であり、本番切り替えの承認ではない。

設計・検証の正本は次とする。

- `documents/migration/pion/roadmap.md`
- `documents/migration/pion/implementation-phases.md`
- `documents/migration/pion/contracts-and-types.md`
- `documents/migration/pion/target-architecture.md`
- `documents/migration/pion/validation-plan.md`
- `documents/migration/pion/risks-and-decisions.md`

## 依存task / 着手前提

- 依存task `task-260726151514-aiortc-baseline-gate-0` が Gate 0を満たし、Chrome / Firefox、
  host candidate / STUN、接続・切断100回、
  30 分通話、CPU、RSS、thread / process / fd、socket、queue、latencyについて、再実行可能なコマンド、環境、
  生値、集計方法、既知不具合を
  `tasks/sincro-rtc/task-260726151514-aiortc-baseline-gate-0/artifacts/baseline-summary.md` と
  `eval.md` に記録していること。同taskの受け入れ条件は
  `tasks/sincro-rtc/task-260726151514-aiortc-baseline-gate-0/task.md:11` 以降を正本とする。
- 実装担当は Phase 0 task の canonical ID、commit SHA、Gate 0 の `PASS` を本 task の `impl.md` 冒頭へ記録する。
  Gate 0 の証跡が存在しない、または同じ scenario を Pion PoC へ適用できない場合、本タスクの実装・測定を開始せず、
  blocker と不足項目を `impl.md` に記録する。

## 完了条件（受け入れ条件）

以下のうちGate 1判定に関するチェック項目は、実装したPoCを指定条件で検証し、各項目を
`PASS` / `FAIL` / `NOT_RUN` と根拠付きで記録することをtask acceptanceとする。現象が成立したこと自体は
Gate 1 `PASS`のhard gateであり、成立しなかった実装・実験もGate 1 `FAIL`を導く有効な調査成果である。
安全上または先行hard gate失敗のため実行不能な項目だけ `NOT_RUN` を許し、因果関係と再実行条件を記録する。
task artifact、ADR、comment audit、自動test / lintの作成・成功はGate判定と別のtask acceptanceとして必須とする。
総合Gate 1の判定規則は後述の「Gate 1集約規則」を正本とする。

- [ ] `sincromisor-server/sincro-rtc-pion-poc/go.mod` で Pion
      `github.com/pion/webrtc/v4 v4.2.17` を直接依存として固定し、`go mod verify` が成功する。PoC 内に
      version range、floating branch、置換 forkを残さない。
- [ ] 現行の `config.json`、`offer`、`candidate` endpoint pathと既存 fieldを維持しつつ、手書き TypeScript /
      Go schemaと共有 JSON fixtureで `offer_request_id`、`offer_revision`、candidate revision、half-trickle
      Answer、下記 HTTP error semanticsを双方向に固定する。OpenAPI生成は導入しない。
- [ ] initial OfferはFrontend生成 UUIDの `offer_request_id` と `offer_revision: 1` を持つ。同じ request ID /
      SDPの直列・並行再送は single-flight で同じ ULID `session_id` と完成済み Answerを返し、異なるSDPへの
      request ID再利用は409、終了済みsessionのTTL内再送は410、cache件数上限は429を返す。candidate収集timeoutは
      sessionをcloseして504を返し、未完成Answerをcacheしない。
- [ ] Frontend→Pionは通常candidateと `candidate: null` のend-of-candidatesをTrickle送信し、
      Pion→Frontendにはcandidate通知APIを追加しない。Pionは `GatheringCompletePromise` を
      `SetLocalDescription(answer)` 前に取得し、有限timeout内のcandidate収集完了後の
      `LocalDescription` だけをAnswerとして返す。
- [ ] 1つの固定UDP mux port、UDP4 / Full ICE、interface filter、STUN、
      `SetICEAddressRewriteRules` による明示public IPv4へのhost candidate置換、Docker 1:1 UDP mappingで
      Chrome / Firefoxの直接接続可否とSDPにcontainer / private host candidateが残らないことを検証・記録する。
      両browserでの直接接続成立とprivate candidate非広告はGate 1 `PASS`のhard gateとする。
      `turn:` / `turns:`、不正public IP、port範囲外、UDP bind失敗、0以下の上限・timeoutはstartup errorにする。
- [ ] Chrome / Firefoxでbrowser→GoのOpus RTPを48 kHzとして受信し、decode / resampleした16 kHz mono
      PCMをgolden waveformと比較する。test PCMを48 kHz、20 ms frameへ変換してOpus RTPで返し、
      browser入力停止中の独立outbound clockによる再生可否を記録する。後述のgolden許容値と等速再生を満たすことは
      Gate 1 `PASS`のhard gateとする。
- [ ] RTP処理はsequence number / timestamp wraparound、bounded reorder、duplicate、window外late packet、
      SSRC変更を処理する。Sender / Receiver Reportを明示登録し、outgoing `RTPSender.ReadRTCP()` をsession
      contextで継続drainする。後述のloss / RTT / jitter / scheduler遅延条件で継続性とburst有無を記録し、
      loop停止0件、burst 0件をGate 1 `PASS`のhard gateとする。
- [ ] NACKあり / なしとOpus PLCを同じloss / RTT matrixで比較し、Gate 1終了時にNACKの採否、reorder window、
      packet history上限を一つの設定へ固定する。回復しないlossとwindow外packetはPLCへ委ね、historyは
      session数や経過時間に比例して無制限増加しない。
- [ ] Frontendが作る `text_ch`（ordered / reliable）と `telop_ch`
      （unordered / `maxRetransmits: 0`）をPionがin-band negotiationで受理できるか、両channelでtest JSONを
      送受信できるかを記録する。`telop_ch` の欠落・重複・順序逆転はsession failureにしない。両browserで
      属性と送受信を満たすことはGate 1 `PASS`のhard gateとする。
- [ ] update Offerは同じPeerConnection、DataChannel、ULID session IDへ単調増加する `offer_revision` を適用する。
      Offer適用とcandidate追加をsession単位で直列化し、同revision / 同SDPの再送は同じAnswer、同revision /
      異なるSDPと並行update Offerは409、旧・未来revisionと不明sessionのOffer / candidateは新規sessionへ
      fallbackせず404 / 409 / 410の契約どおり拒否する。ICE restart後の双方向音声と両DataChannelの復旧可否を
      記録し、全revision拒否semanticsと両browserでの復旧をGate 1 `PASS`のhard gateとする。
- [ ] Answer生成、ICE / DTLS確立、audio track、必須DataChannel readiness、`disconnected` grace、
      ICE restart確立に独立した有限deadlineを実装する。timeout、browser abrupt close、malformed SDP /
      candidate、codec error、track / channel欠落は同じclose-once経路へ収束する。
- [ ] HTTP body、SDP、candidate文字列、1 revisionのcandidate件数、Frontend pending candidate queue、
      initial Offer cache / tombstoneについてbyte数・件数・TTL上限を持つ。境界値は成功し、上限超過は
      400 / 413 / 429へ一意に分岐して、PeerConnection、queue、cacheを部分作成したまま残さない。
- [ ] libopus bindingとGStreamer codec adapterの両方で同一interface / fixture / benchmarkを実行し、音質、
      encode / decode p50・p95、CPU、session当たりmemory、native resource回収、container image増分、
      amd64 / arm64 build、debuggabilityを比較する。後述の選定規則でcodecと配布方式を一つに決める。
- [ ] VoiceSynthesizer requestの全許容値 `audio/wav`、`audio/aac`、`audio/ogg`、
      `audio/ogg;codecs=opus` について実response形式を記録し、WAV / PCM、AAC、Ogg / Opusの正常、空、
      truncated / malformed、上限超過、decoder timeoutを候補codecごとに検証する。採用codecで必須3形式を
      後述のgolden許容値内でdecodeできることはGate 1 `PASS`のhard gateとする。
- [ ] session終了後にPeerConnection、codec、queue、timer、goroutine、UDP関連session stateをclose-onceで回収する。
      正常close、接続未成立、track欠落、DataChannel欠落、ICE failed、codec error、browser abrupt closeを含む
      接続・切断100回後の値を記録する。active session / codec instance / session queueが0、session固有socketが0、
      goroutineがidle中央値+5以内へ収束し、heap profileに同一session ownerから到達可能な増加を残さないことは
      Gate 1 `PASS`のhard gateとする。
- [ ] Phase 0と同じChrome / Firefox / network / 30分通話scenarioで比較し、接続成功率がbaseline未満、
      audio path p95 latencyが `max(baseline × 1.10, baseline + 20 ms)` 超、通話中CPUまたはheap in-useが
      baseline × 1.20超かを記録する。いずれかの超過、または環境差で同一比較ができない項目があれば
      Gate 1の当該hard gateを `FAIL` とし、再測定条件を残す。
- [ ] `tasks/sincro-rtc/task-260726150803-pion-codec-poc-gate-1/artifacts/gate-1-summary.md` に、環境、
      Phase 0参照、全scenarioのコマンド、入力SHA-256、集計値、limit / timeout、codec比較、NACK採否、
      Gate 1各項目の `PASS` / `FAIL` / `NOT_RUN`、根拠、再実行条件を記録する。集計CSV / JSON以外の
      packet capture、raw audio、
      browser profile、traceは `work/private-artifacts/task-260726150803-pion-codec-poc-gate-1/` に置き、
      task artifactへcommitしない。
- [ ] Gate 1が `PASS` ならPionをPhase 2へ採用するADR、`FAIL`ならPion不採用と
      GStreamer `webrtcbin` / aiortc再評価を記すADRを作成する。どちらもcodec選定、half-trickle、
      initial Offer冪等性、NACK、network方式、実測task参照、棄却案、見直し条件を含める。
- [ ] production codeの変更とchange comprehension surfaceを
      `documents/rules/source-comments.md` / `documents/rules/coding-go.md` /
      `documents/rules/coding-ts.md` に基づき監査し、auditを `impl.md` に残す。各行は `path`、
      `symbol / block / decision`、`kind`、`current comment`、`reader question`、
      `required reader knowledge`、`decision`、`action / omission reason`、`reviewer note` を持つ。
      新規export、network boundary、schema、state transition、goroutine / lock / queue、codec ownership、
      RTP変換、timeout / limit / fallbackを全件対象にし、stale・逐語説明は削除またはrewriteする。
- [ ] 変更したproduction codeと直接のhelper / state / event / lifecycle / data transformationを全件照合し、
      exported APIの目的・入力境界・戻り値・失敗・副作用、内部flowの段階・表現変換・前後関係・終了条件を
      局所的に理解できるコメントへ更新する。`private`、`短い`、`型がある`、`testを読めば分かる`、
      `既存にもない` は単独の省略理由にせず、TODOを加える場合は理由、削除条件、canonical task ID、
      期限または判断基準を含める。
- [ ] `go test ./...`、`go test -race ./...`、`go vet ./...`、Go formatter、
      frontend lint / type・build / test、codec別integration test、`npm run gate`、
      `npm run tasks:check` が成功する。実機・network testを含む各コマンドと結果を `impl.md` に記録する。

## 設計判断（着手前に確定済み）

### 実装の隔離とmodule構成

- PoCは現行 `sincromisor-server/sincro-rtc/` を置換せず、
  `sincromisor-server/sincro-rtc-pion-poc/` に独立Go moduleとして置く。Phase 1で未確定の実装を
  production compose / Consulのstable serviceへ混ぜないためである。
- 最小module構成を次に固定する。
    - `cmd/pion-poc/main.go`: typed config load、startup validation、HTTP server lifecycleのみ。
    - `internal/config/config.go`: bind、public IPv4、UDP mux、STUN、上限、deadlineの型とvalidation。
    - `internal/signaling/{model,handler,offer_store}.go`: JSON境界、HTTP semantics、
      initial Offer single-flight / TTL cache / tombstone。
    - `internal/rtc/{server,session,restart}.go`: PeerConnection生成、session registry、revision state、
      close-once、deadline。
    - `internal/media/{inbound,outbound,rtp,rtcp}.go`: RTP reorder / unwrap、decode / resample、
      independent clock、RTCP drain。
    - `internal/codec/codec.go`: codec差を隠す `Factory` / `Decoder` / `Encoder` interface。
    - `internal/codec/libopus/` と `internal/codec/gstreamer/`: 候補固有adapter。native handleはこのpackage外へ
      公開しない。
    - `internal/datachannel/dispatcher.go`: channel属性検証とtest JSON送受信。
    - `internal/observability/`: session / goroutine / codec / queue / RTP / RTCPのPoC metric。
    - `testdata/signaling/`、`testdata/audio/`: 共有JSON fixtureとライセンス・生成方法が明確な小型golden。
- production用pipeline client、Conversation Coordinator、Consul登録、stable compose切替はこのmoduleへ
  先行実装しない。Python adapterを使う場合はtest PCMまたは既存AudioBrokerへの一時bridgeに限定し、
  `// TODO(task-260726150803-pion-codec-poc-gate-1): Phase 1のcodec検証だけに使うbridgeを削除する /
  削除条件: Phase 2のGo pipeline clientで同じ入出力を再現できた時点 / 判断期限: Phase 3開始前`
  と所有境界を明記する。

### 最小schemaと状態

- Go / TypeScriptのinitial Offer requestは
  `{sdp:string,type:"offer",talk_mode:"chat"|"sincro",offer_request_id:UUID,offer_revision:1,
  previous_session_id?:ULID}`、update Offerは同fieldに
  `{session_id:ULID,offer_revision:uint64>=2}` を加える。
- Answerは既存 `{sdp,type:"answer",session_id}` に `offer_revision:uint64` を加える。
  candidate requestは既存 `{session_id,candidate}` に `offer_revision:uint64` を加える。
  `usernameFragment` は透過診断値でありgeneration識別には使わない。
- session IDはGo側生成ULID、request IDはFrontend生成UUID、revisionは1始まりの単調増加整数に固定する。
  SDP文字列、ICE username fragment、乱数session IDだけで冪等性や世代を推測する案は、retryとrestartを
  区別できないため採らない。
- Offer store entryの最小状態は
  `{requestID, sdpSHA256, state(in_flight|completed|tombstone), sessionID, answer, expiresAt}` とする。
  completedになるのはcandidate収集完了Answer取得後だけである。
- sessionの最小状態は
  `{id,currentRevision,peerConnection,codec,queues,deadlines,closeOnce,contextCancel}` とし、
  Offer適用とcandidate追加はsession所有event loopで直列化する。複数lockを呼出側で組み合わせる案は、
  candidate / Offerの順序とclose競合を証明しにくいため採らない。

### network、media、codec

- Pionはv4.2.17、UDP4 / Full ICE、単一UDP mux、明示public IPv4 rewrite、STUN併用、1 instanceを採る。
  Server→Frontend candidate endpoint、TURN、IPv6、複数instance、active session移送は採らない。
- codec interfaceの単位はsigned 16-bit little-endian PCMで、inbound出力は16 kHz mono、
  outbound入力は48 kHz、20 ms（960 sample / channel）とする。RTP timestampとtelop同期の正本は
  wall clock floatではなく48 kHz sample positionの整数とする。
- outbound clockはabsolute deadlineを基準にする。遅延時は期限切れsilenceを破棄し、発話audioはburstせず
  実時間隔で再開する。queueが空の間はRTP送信を休止し、発話開始時にtimestamp連続性を保って再開する。
  常時silence送信は帯域と計測を増やすため採らない。
- codec選定は、両候補へ同一fixtureを適用し、まず機能、異常入力、100回close、amd64 / arm64 buildを
  hard gateとする。片方だけ通ればその候補、両方失敗ならGate 1 `FAIL`。両方通る場合、libopusが
  GStreamer比でencode / decode p95、通話中CPU、session当たりheapの全て `<= 1.10倍` かつcontainer image増分が
  小さければlibopusを選ぶ。それ以外はGStreamerを選ぶ。同値はnative pipelineと配布依存が小さいlibopusを選ぶ。
- NACKは同じloss / RTT matrixで、音声欠落時間p95をPLCのみより10%以上短縮し、追加latency p95が20 ms以下、
  packet historyが設定上限内の場合だけ採用する。満たさなければNACKなし + PLCを採用する。

### 測定protocolと許容値

- audio goldenはrepository内generatorで作る、3.0秒、48 kHz mono s16le、997 Hz sine、-12 dBFS、
  先頭 / 末尾100 ms silenceのPCMを正本とする。generator sourceと生成PCMのSHA-256をartifactへ記録する。
  decode比較は先頭 / 末尾silenceを除く2.8秒を対象にし、duration差20 ms以下、channel=mono、
  sample rate=16 kHz、主周波数差1 Hz以下、RMS差1.0 dB以下、絶対sample peakがs16範囲内、DC offsetが
  full scale比0.003以下をPASSとする。Opusはlossyなのでsample単位一致やPCM SHA一致を要求しない。
- network impairmentの全組合せはRTT `{0, 50, 150, 300}` ms、片方向jitter `{0, 20, 50}` ms、
  packet loss `{0, 1, 5, 10}` %、固定seed `{1101, 2202, 3303, 4404, 5505}` とする。
  各組合せを60秒×5試行し、p50 / p95は全試行のpacket / frame観測値を結合したnearest-rankで算出する。
  接続成功率はbrowser / 条件ごとの成功session数÷5とし、1試行中に必須media / channelが60秒維持できなければ
  失敗sessionと数える。
- scheduler遅延はoutbound clock起動10秒後から200 msと1,000 msのfake-clock pauseを各10回注入する。
  pause解除後の1秒窓で、送信間隔5 ms未満のRTP packetが2個以上連続した場合をburstと定義し、1件でもあれば
  pacing hard gateをFAILとする。
- RTP reorderはwindow候補 `{16, 32, 64}` packet、NACK historyは `{64, 128, 256}` packetで比較する。
  reorder試験は各windowについて0からwindow+1 packetの遅延、duplicate 10%、wraparound前後128 packet、
  SSRC変更1回をseedごとに注入する。late / duplicate誤採用が0で、正常packet dropが最少の最小windowを選ぶ。
- NACK比較は上記network matrixをNACK off / history 64 / 128 / 256で実行する。音声欠落時間はdecode出力の
  連続無音またはPLC frame区間の長さとし、発話中の20 ms以上の連続区間を1 gapとしてnearest-rank p95を取る。
  loss 0%ではgap短縮を評価せず、gapが0件ならgap p95を `not_applicable` と記録し、NACK off比の
  end-to-end p95増分20 ms以下かつ新規gap 0件だけを無損失regression条件とする。loss 1 / 5 / 10%では、
  PLCのみのgapが0件なら短縮率を `not_applicable` とし、NACK側も新規gap 0件かつ追加latency p95増分20 ms以下を
  必須とする。PLCのみのgapが1件以上なら
  「PLCのみ比gap p95 10%以上短縮」「end-to-end p95増分20 ms以下」を両方要求する。全loss > 0%の
  評価可能条件とloss 0% regression条件を満たす最小historyを選び、1条件でも満たさなければNACKなしを選ぶ。
- codec microbenchmarkは同一hostをidleにしてwarm-up 30回後、golden audioのencode / decodeを各100回×5 process
  で実行する。各processのmedianを取り、5 medianからnearest-rank p50 / p95を算出する。CPUはprocess CPU time、
  memoryはGC / native cleanup後のheap / RSS、image増分は同じbase imageとの差、buildはlinux/amd64とlinux/arm64の
  clean buildで比較する。
- codec hard gateは、golden許容値、全異常入力の有限error、100回close後のnative handle 0、sanitizer / leak検査0件、
  amd64 / arm64 build成功をすべて満たすこととする。音質の主観評価は補助記録とし、採否を変更しない。
- resource収束は各close後30秒をdeadlineに1秒間隔で観測する。idle値は開始前60秒の中央値、終了値は
  最後の10秒の中央値を使う。heapは100 sessionのsession ID別ownerがprofile上0件であることに加え、
  10 / 50 / 100回地点のin-use bytesへ単調な正の線形傾向がないこと
  （ordinary least squares slopeの95%信頼区間が0を跨ぐこと）をPASSとする。

### limit、timeoutの確定方法

- limit / timeoutは無制限や手調整余地を残さず、Chrome / Firefoxの正常scenario全観測値から次の決定式で固定する。
    - byte / 件数limit: `max(規定floor, ceil(正常最大値 × 2))`。floorはHTTP body 64 KiB、SDP 32 KiB、
      candidate文字列4 KiB、candidate 32件 / revision、Frontend pending 32件、Offer cache 128件。
    - Answer収集 / ICE-DTLS / media readiness / restart deadline:
      `max(規定floor, ceil(正常p99 × 3 / 100ms) × 100ms)`。floorは順に5秒 / 15秒 / 10秒 / 20秒。
    - disconnected grace: network断の自然復旧p99を同式で丸め、floor 3秒。
    - codec入力上限: 正常な各VoiceSynthesizer responseの最大byte数 / 再生時間を2倍して上位の
      64 KiB / 1秒へ切り上げる。decoder timeoutは正常decode p99の3倍を10 ms単位へ切り上げ、floor 1秒。
    - Offer cache / tombstone TTL: FrontendのOffer総retry期限の2倍、floor 2分。
- 算出結果はtyped config default、sample config、artifactへ同じ値で記録する。0 / 負数や相互矛盾する値を
  起動後に補正せずstartup errorにする。

### Gate 1集約規則

- Gate 1の各行は `id`、`result(PASS|FAIL|NOT_RUN)`、`evidence`、`reason`、`rerunCondition` を持つ。
- Gate 1 `PASS` に必要なhard gateは、Pion version / build、共有signaling contract、initial Offer冪等性、
  half-trickle、Chrome / Firefox直接接続、双方向audio golden、RTP / RTCP / pacing、DataChannel、同一sessionの
  ICE restart、stale revision拒否、deadline / error収束、境界上限、採用codec hard gate、VoiceSynthesizer必須3形式、
  100回resource収束、Phase 0比較budgetである。全hard gateが `PASS` の場合だけ総合 `PASS` とする。
- hard gateが1件でも `FAIL` または `NOT_RUN` なら総合Gate 1は `FAIL` とする。optionalなsingle-port ICE-TCPは
  総合判定へ含めない。
- 総合Gate 1が `FAIL` でも、指定実験を完了し、安全上または因果的に実行不能な項目へ根拠と再実行条件を記録し、
  不採用ADRを作成していれば本taskの実装は完了可能である。task evaluatorの `PASS` / `FAIL` は
  「調査taskの仕様どおり判定できたか」を表し、Gate 1の技術判定と混同しない。

## スコープ境界

本タスクはPhase 1の一つの変更束として、Go PoC、必要最小限のFrontend signaling state、共有contract fixture、
codec比較、network / media / lifecycle測定、Gate 1判定、ADRを所有する。frontend変更はPion PoCで必要な
optional fieldとICE restart stateに限定し、aiortc backendは未知fieldを無視できること、revisionなしAnswerを
rollback期間だけ許容することをcontract testで維持する。

次はスコープ外とする。

- Phase 0 baselineの新規取得・補完、Phase 2のGo pipeline clients / MessagePack DTO / Consul lookup
- Phase 3のConversation Coordinator、production session registry、stable endpoint統合、正式observability
- production compose / env / Consul registrationの切替、aiortcとの同時運用、運用rollback
- Python下流serviceのpayload変更、Protocol Buffers、OpenAPI生成
- TURN、IPv6、複数Pion instance、active session移送、SFU
- RTP / playout clockに合わせたfrontend telop scheduling
- PoCを本番serviceへ昇格すること、現行Python RTC stackを削除・置換すること

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/roadmap.md:65` はPhase 1をPion採否、codec、media / ICE成立性の判断段階とし、
  `:83` はGate 1通過時のADR化を要求している。本タスクの成果を実装だけで終わらせず判断記録まで含める。
- `documents/migration/pion/implementation-phases.md:53` から `:100` はPion v4.2.17、half-trickle、
  UDP mux、RTP / RTCP、codec比較、100回closeをPhase 1 / Gate 1に割り当てている。
- `documents/migration/pion/contracts-and-types.md:31` から `:69` はrequest ID、ULID session、
  revision、Offer直列化、half-trickle、手書きschemaを定義し、`:71` から `:79` はHTTP 400 / 404 / 409 /
  410 / 413 / 429を定義する。PoCのhandler / fixtureはこの境界を縮小解釈しない。
- `documents/migration/pion/target-architecture.md:253` から `:264` はsample position同期と
  libopus / GStreamer比較、`:268` から `:279` はsession所有resourceとprocess modelを定義する。
- 現行契約は `documents/design/contracts/frontend-rtc.md:25` から `:47` のendpoint / DataChannel属性、
  `:61` から `:107` の既存payloadを維持する。本タスクの追加fieldとerror semanticsを同文書へ同期する。
- `sincromisor-frontend/src/features/rtc/rtcNegotiation.ts:6` から `:11` のOffer型と `:56` から `:94` の
  fetch境界へrequest ID / revision / timeout / status分岐を追加する。
- `sincromisor-frontend/src/features/rtc/rtcIceCandidateSender.ts:6` から `:24` のcandidate payloadへrevisionを
  加え、`:25` から `:45` の全error握り潰しを契約別retry / generation failureへ分離する。
- `sincromisor-frontend/src/features/rtc/rtcTalkClient.ts:26` から `:40` はsession ID、pending candidate、
  stable sessionだけを保持し、`:113` から `:133` は切断時にsession IDを無効化して再接続する。
  request ID、revision、bounded revision別candidate queue、disconnected grace、single-flight restartを
  同clientが所有し、新しいglobal singletonを作らない。
- `sincromisor-frontend/src/features/rtc/rtcBoundarySchema.ts:17` から `:26` のZod境界へoptional
  `offer_revision` と拡張candidate responseを追加する。aiortc Answerのrevision欠落をrollback期間だけ許容し、
  Pion選択時はrevisionを必須として上位stateで検証する。
- Python endpointは `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSignalingApp.py:32` から `:90`、
  Offer modelは `sincromisor-server/sincro-rtc/src/sincro_rtc/models/RTCSessionOffer.py:14` から `:19` にある。
  PoC optional fieldを未知fieldとして受け入れる互換test以外は変更せず、Pythonへrevision state machineを移植しない。
- Go production codeは `documents/rules/coding-go.md`、Frontendは `documents/rules/coding-ts.md`、
  横断comment auditは `documents/rules/source-comments.md` を正本にする。

## テスト

- Go unit / race:
    - JSON schema、UUID / ULID、limit境界、malformed SDP / candidate、startup config拒否。
    - Offer storeの同一 / 異なるSDP、single-flight、timeout、TTL、tombstone、capacity。
    - revision stateとOffer / candidate直列化、close競合、deadline、goroutine / queue回収。
    - RTP sequence / timestamp wraparound、reorder / duplicate / late / SSRC変更、pacing fake clock。
    - codec interfaceの正常・空・truncated・malformed・oversized・timeout、close冪等性。
- Frontend unit:
    - UUID request IDのretry再利用とSDP再生成時の更新、revision単調増加。
    - revision別candidate queueの順序、end-of-candidates、上限超過、Offer失敗時破棄。
    - disconnected graceの自然復旧、failed / grace超過のsingle-flight restart。
    - 400 / 404 / 409 / 410 / 413 / 429 / 5xx / timeout / network errorの分岐。
    - revisionありPion Answerとrevisionなしaiortc Answerのbackend別validation。
- contract / browser integration:
    - 共有JSON fixtureをGo / TypeScriptでparseし、既存fieldと追加fieldが一致する。
    - Chrome / Firefox × host / STUN / public IPv4 rewrite × initial / restartを実行する。
    - Server→Frontend candidate APIが存在しない状態でcompleted Answerから接続する。
    - DataChannel属性、test JSON、双方向音声、sample rate / duration / playback速度を確認する。
- network / media:
    - 1 / 5 / 10% loss、latency / jitter、短時間断、candidate順序変更、旧revision遅延、
      scheduler停止を再現可能なscript / container設定で注入する。
    - NACKあり / なし、PLC、reorder / pacing、RTCP、mora timestampを同一入力で比較する。
- resource / codec:
    - idle、1 session、正常 / 異常close 10 / 50 / 100回、30分soakをPhase 0と同じ観測方法で実行する。
    - libopus / GStreamerの両adapterを同一audio fixture、VoiceSynthesizer format、build matrixで比較する。
    - native codecを使う候補はsanitizer / leak検査を実行し、未実行なら候補をhard gate不合格にする。
- repository gate:
    - Go moduleでformatter、`go vet ./...`、`go test ./...`、`go test -race ./...`。
    - frontendでlint / type・build / test、repository rootで `npm run gate`。
    - `npm run tasks:index:check`、`npm run tasks:check`。
- evaluatorは変更production codeとcomment auditの全件を照合する。広域変更で全件照合不能ならpublic API、
  network / codec boundary、orchestration、state / data flow、rewrite / delete、定型省略理由を優先し、
  照合範囲・未照合範囲・残リスクを `eval.md` に記録する。逐語説明、参照先だけのコメント、失敗modeのない
  threshold説明、内部flowの理解困難、既存無コメントを根拠にした省略、定型audit理由があれば `FAIL` とする。

## ドキュメント同期の要否

要。公開signaling schema、HTTP error、ICE restart、half-trickle、limit / timeoutというFrontend / RTC間契約を
追加するため、`documents/design/contracts/frontend-rtc.md` を実装と同時に更新する。PoCの起動・network設定は
移行中のdeveloper-visible挙動なので `documents/migration/pion/implementation-phases.md` と
`documents/migration/pion/validation-plan.md` には確定値を重複転載せずtask artifactへの参照だけを追加する。

Gate 1判定は `documents/design/decisions/ADR-260726-pion-codec-poc.md` に記録し、
`documents/design/index.md` のDecisionsへ導線を追加する。Phase 1はproduction compose / stable serviceを
変更しないため、`compose.yml`、`examples/compose.env`、現在設計
`documents/design/backend/services/sincro-rtc.md` の更新は不要である。Goの公開バレルや生成コードは導入しない。
