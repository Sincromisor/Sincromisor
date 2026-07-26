# aiortc現行baselineを取得してGate 0を判定する

## 背景 / 目的

`documents/migration/pion/roadmap.md` の Phase 0 は、Pion PoCを現行Python / aiortc実装と同じ条件で比較するため、
機能、接続成功率、音声latency、CPU / memory、session resource、既知不具合を再現可能なbaselineとして固定する
段階である。本タスクではproduction codeや通信契約を変えず、現行backendへ再利用可能な測定harnessを適用して
Gate 0を判定する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-server/sincro-rtc/pyproject.toml` の宣言値 `aiortc>=1.13.0`、`uv.lock` の解決値、
      実行環境の `importlib.metadata.version("aiortc")` を別fieldで記録する。lock / runtimeが `1.14.0` と
      異なる場合は依存を変更せず、version差をGate 0 `FAIL`として記録する。
- [ ] Chrome / Firefoxについて、local host candidate、固定coturn STUNの各経路でinitial connection、通常close、
      ICE failed後の再Offer、browser abrupt closeを各20回実行し、後述のevent / stage定義で成功数、失敗stage、
      signaling / media ready時間p50 / p95を記録する。
- [ ] 正常closeの接続・切断を10 / 50 / 100回、abrupt closeを100回実行し、idle、接続中、終了収束後のCPU、
      RSS、Python heap、thread、child process、fd、TCP / UDP socket、AudioBroker WebSocket / queueを測る。
- [ ] Chrome / Firefoxで30分以上の連続双方向音声を各1回実行し、browser capture→Python PCM、
      Python synthesized PCM→browser playback、end-to-endのlatency p50 / p95、音切れ、clipping、
      sample rate / channel / playback速度を後述のmarker / clock同期方式で記録する。30分scenarioはhost candidateで
      実行し、STUNは20回の接続matrixで互換性を確認する。
- [ ] 正常close、ICE failed、browser abrupt close後に、active session / child process / AudioBroker WebSocket /
      session queueが0へ収束するかを記録する。収束しない場合も測定を正規成果としてGate 0へ反映し、
      baseline取得task自体を未完了にはしない。
- [ ] 各scenarioは固定seed、duration、回数、network条件、browser version、OS / architecture、container image /
      commit SHA、実行コマンド、観測interval、収束待ちdeadlineをmanifestで固定し、Phase 1から同じmanifestを
      backendだけ差し替えて再実行できる。
- [ ] Gate 0は、必須scenarioがすべて実行され、生値と集計値が保存され、Phase 1で同じ入力・観測方法を再利用でき、
      現行不具合と移行で解決すべき問題が分離されている場合だけ `PASS` とする。機能や性能の悪さ自体はbaseline
      取得失敗にしない。実行不能、欠測、再現不能な手順が1件でもあれば `FAIL` とする。
- [ ] `tasks/sincro-rtc/task-260726151514-aiortc-baseline-gate-0/artifacts/baseline-summary.md` に環境、
      scenario別集計、既知不具合、Gate 0判定を記録し、機械比較用の小型CSV / JSON manifestを同`artifacts/`へ置く。
      raw audio、packet capture、browser profile、traceは
      `work/private-artifacts/task-260726151514-aiortc-baseline-gate-0/` に置き、SHA-256だけを公開artifactへ記録する。
- [ ] 測定harness / scriptを追加する場合はoffline集計と実browser / network測定を分離し、fixtureで集計式をtestする。
      production codeを変更しない。測定に必要な観測値が現行公開interfaceで取得不能なら本タスクへinstrumentationを
      混ぜず、後述のtest-only process probeで取得する。probeでも取得不能なfieldは結果schemaで
      `availability: "not_available"`、`value: null`、理由を記録し、Gate 0 `FAIL`として独立task候補を残す。
- [ ] docs / test / scriptのみの変更であるためproduction comment auditは対象外とし、その理由を `impl.md` に記録する。
      scriptの公開function、測定単位、集計式、失敗条件には対象言語規約に従うdoc commentを付ける。
- [ ] 対象unit test、script lint / format、`npm run gate`、`npm run tasks:check` が成功し、実機測定コマンドと
      結果を `impl.md` に記録する。

## 設計判断（着手前に確定済み）

- 再利用可能なscenario manifest、runner、offline集計は
  `scripts/validation/rtc-baseline/` に置く。task artifactだけに手順を埋める案はPhase 1で同一実行を保証できないため
  採らない。
- manifestの最小schemaは
  `{schemaVersion, sourceCommit, environment, browsers[], scenarios[], sampleIntervalMs,
convergenceDeadlineMs, privateInputs[]}` とする。scenarioは
  `{id, browser, candidateMode, closeMode, repetitions, durationSeconds, network}` を持ち、
  networkは `{rttMs, jitterMs, lossPercent, seed}` とする。
- latencyはmonotonic clockの区間差、CPUはprocess CPU time / wall time、memoryはRSSとheapを分離し、
  p50 / p95は昇順nearest-rankで計算する。欠測値を0で補完しない。
- resource収束待ちはclose後30秒、観測intervalは1秒とする。RSSはallocator都合で即時に戻らないため単独でleak判定せず、
  active object、process、thread、fd、socket、WebSocket、queueと併記する。
- browser実写音声には著作物・個人情報を使わず、Phase 1と共有する決定的生成音を使用する。公開repoへraw音声を
  commitせず、generator設定とSHA-256で同一性を固定する。

### 測定harness

- runnerはPython 3.12で `scripts/validation/rtc-baseline/` に実装し、Python版Playwright、`psutil`、
  `websockets` をroot `dependency-groups.validation`へ固定する。Node版とPython版を混在させる案は、
  downstream stub / process probeとのclock同期を増やすため採らない。
- `runner.py` はPlaywrightの `channel="chrome"` でhostにインストール済みGoogle Chrome stableを、
  Playwright管理のFirefoxをheadlessで起動し、同directoryのvalidation pageをloopback HTTPでserveする。
  Chromium結果をChromeと表記しない。Chrome stableが無い場合はfallbackせずGate 0 `FAIL`、
  Playwright Firefoxのrevision不一致はinstall手順を実行してから測定し、双方の製品名・version・binary SHA-256を
  manifestへ記録する。既存Vite pageのUI操作はcamera / dialog / 3D lifecycleを測定へ混ぜるため採らない。
  validation pageは公開RTC contractだけを使い、backend固有private APIを呼ばない。
- browser入力はWeb Audioの`AudioBufferSourceNode`から`MediaStreamAudioDestinationNode`へ生成し、
  そのtrackをPeerConnectionへaddする。remote trackは`AudioWorklet`へ接続し、PCM marker検出値だけを
  Playwright bindingへ返す。OS microphone / speaker、fake-device browser flag、実人物音声は使わない。
- SpeechExtractor / Recognizer / TextProcessor / VoiceSynthesizerは
  `scripts/validation/rtc-baseline/stubs/` のcontract stubへ固定し、既存WebSocket + MessagePack fieldを受理する。
  Extractor stubは入力PCM markerを検出してhost monotonic timestampを記録し、後続stubは固定responseを順に返し、
  Synthesizer stubは同じmarker IDを埋めた決定音とmora timingを返す。実model推論時間はbaseline対象に含めない。
- browser `performance.now()` とrunner `time.monotonic_ns()` は接続前に20回pingし、runner送受信midpointとbrowser値の
  offsetを推定する。最小round-trip sampleを採用し、clock error boundが5 msを超えたsessionはlatency sampleを
  `not_available(clock_sync_error)` とし、接続成否の母集団には残す。
- network impairmentはLinux container / network namespace内のRTC backend interfaceへ`tc netem`を適用する。
  Phase 0の通常matrixは `{rttMs:0,jitterMs:0,lossPercent:0,seed:1101}` に固定する。ICE failed再Offerだけは
  接続20秒後にbackend向けpacketを10秒間100% lossにし、復旧後30秒を観測する。macOSのNetwork Link Conditionerや
  browser throttlingは再現性とUDP適用範囲が異なるため採らない。
- host candidate scenarioは`iceServers: []`、STUN scenarioはvalidation compose内のcoturn
  `4.6.3`をSTUN専用で起動し、image digestをmanifestへ記録する。STUN scenarioではbrowserから送るcandidateを
  `candidateType === "srflx"` に限定し、`getStats()`のselected candidate pairがsrflxであることを成功条件にする。
  外部public STUNは可用性・経路変動でbaselineを変えるため採らない。
- test-only process probeは`PYTHONPATH`でvalidation bootstrapを先にimportし、production fileを書き換えず、
  Linuxの`fork`でsession childへ継承する。1秒ごとにUnix datagramへtracemalloc current bytes、
  AudioBrokerの6 queue length、communicator WebSocket数、session IDを送る。probe thread / socket自身は
  `probeOverhead`として別fieldにしapplication thread / fd / socket数から1件ずつ除外する。probeなしのidle 60秒と
  probeありidle 60秒を比較し、CPU 2 percentage pointsまたはRSS 5%を超える差があれば測定侵襲としてGate 0を
  `FAIL`にする。
- process resourceは`RTCSignalingServer` root PIDと全session childのprocess treeを対象にし、validation stub /
  browser / Consul /下流serviceは除外する。CPUはtree合計CPU time差÷wall time、RSS / Python heap / thread /
  fd / TCP・UDP socketはtree合計、child processは件数、WebSocketはprobeとstubのsession別一致数、queueは
  6 queueごとのdepth / maxlenを保持する。processが消えた後の値は0、観測失敗は欠測であり0補完しない。

### event、latency、result schema

- connection開始 `t0` はbrowserがinitial `/offer` fetchをdispatchする直前、signaling終端 `t1` はAnswerをparseして
  `setRemoteDescription`がresolveした時点とする。media ready `t2` は
  `iceConnectionState ∈ {connected,completed}`、両DataChannel `open`、remote audio trackの最初の非無音frameを
  すべて満たした最後の時点とする。60秒以内に`t2`へ到達したsessionだけ接続成功とする。
- failure stageは最初に失敗した
  `config | offer_http | answer_parse | remote_description | candidate_http | ice | datachannel | audio |
reconnect | close | timeout` のfixed enumとし、複数errorは最初をprimary、残りをsecondary配列へ入れる。
- `signalingLatencyMs=t1-t0`、`mediaReadyLatencyMs=t2-t0` はbrowser monotonic domainで測り、成功sessionごとに
  1 sampleとする。p50 / p95はbrowser / candidateMode / closeMode別の成功sampleだけをnearest-rank集計し、
  成功0件はvalue `null` / availability `not_available(no_successful_session)` とする。
- markerは5秒ごとに送る。各markerは20 msの997 Hz sync、16-bit big-endian marker IDとCRC-4を
  700 / 1,300 Hzのbinary FSK（1 bit 5 ms）で符号化した100 ms payload、前後100 ms silence、-12 dBFSとする。
  IDはsession内で0から単調増加し、Extractor stubとbrowser AudioWorkletはsync検出後にID / CRCをdecodeする。
  CRC不一致はmarker欠落として記録し、検出順による対応付けやID推測をしない。
  `captureToPythonMs` はbrowser marker開始をclock offsetでhost時刻へ変換した値からExtractor stub検出まで、
  `synthesizedToBrowserMs` はSynthesizer stubが最初のmarker PCMをWebSocket送信したhost時刻からbrowser
  AudioWorklet検出時刻をhostへ変換した値まで、`endToEndMs` はbrowser marker開始から同IDのremote marker検出まで
  とする。30分×12 marker/分=360 markerを母集団とし、欠落markerはdrop countへ入れてquantileから除外する。
  stub群はsession別にExtractorでCRC確認済みIDをqueueし、そのIDに対応して後続の固定recognition / text /
  synthesized responseを1組だけ生成する。途中欠落ではrequestを生成せず、次にdecodeできたIDをそのまま応答へ
  符号化するため、drop後も別markerを誤対応させない。
- audioはremote AudioWorkletの各markerでduration差20 ms以下、997 / 700 / 1,300 Hz各成分の周波数差1 Hz以下、
  ID / CRC一致、RMS差1 dB以下、clipping sample 0、DC offset full-scale比0.003以下を記録する。
  sample rate / channelはtrack settingsとworklet bufferから検証する。
- raw result最小schemaは
  `{schemaVersion,runId,scenarioId,repetition,browser,candidateMode,closeMode,environment,
connection:{result,primaryStage,secondaryStages,t0,t1,t2},latencySamples[],audioSamples[],
resources[],errors[]}` とする。各numeric observationは
  `{value:number|null,unit,availability:"available"|"not_available",reason?:string}` とし、欠測fieldを省略しない。
- aggregate最小schemaは
  `{schemaVersion,sourceRuns[],scenarioSummaries[],resourceCheckpoints[],knownIssues[],gate0}` とし、
  summaryはcount / success / failure、stage count、nearest-rank p50 / p95、missing count、input SHA-256を持つ。
  `gate0` は `{result:"PASS"|"FAIL",checks:[{id,result,evidence,reason}]}` とする。
- scenario matrixはChrome / Firefox × host / STUN ×
  `initial_normal | normal_close | ice_failed_reoffer | browser_abrupt_close`を各20回・60秒上限で実行する。
  resource loopはChrome / host / normal_closeを10 / 50 / 100回、Chrome / host / abrupt closeを100回、
  soakはChrome / hostとFirefox / hostを各30分実行する。全scenarioのtalk modeは`chat`、同時session数は1、
  実行順序はmanifest記載順に固定する。

### scenario別の成功終端

- `initial_normal`: `t0`から60秒以内に`t2`へ到達し、marker ID 0を1往復できた場合に成功とする。その後は
  `RTCPeerConnection.close()`でcleanupし、session countが開始前値へ30秒以内に戻ることも必須とする。
- `normal_close`: `initial_normal`のmedia ready後10秒維持し、両DataChannelをcloseしてから
  `RTCPeerConnection.close()`を呼ぶ。browserの全connection stateが`closed`になり、server session count、
  probe WebSocket / queue、session child processが30秒以内に開始前値へ戻った場合だけ成功とする。
- `browser_abrupt_close`: `initial_normal`のmedia ready後10秒で、page側のclose handlerや
  `RTCPeerConnection.close()`を呼ばずPlaywright `browserContext.close()`を実行する。server session count、
  probe WebSocket / queue、session child processが30秒以内に開始前値へ戻った場合だけ成功とする。
- `ice_failed_reoffer`: 初回`t2`後、RTC media UDPだけへ100% lossを最大30秒適用し、browserの
  `iceConnectionState === "failed"`を必須eventとして観測する。観測後にnetemを解除し、5秒以内に同じ
  PeerConnectionで`createOffer({iceRestart:true})`をdispatchし、既存session IDをpreferred IDとして送る。
  update / fallback後30秒以内に新しい`t2`へ到達してmarker往復が再開した場合に成功とする。session IDは
  `preserved | replaced`を結果fieldへ記録し、現行挙動のbaselineなのでどちらも接続成功にできるが、
  Offer失敗、`failed`未観測、media未復旧はscenario失敗とする。
- scenario成功数は上記のscenario全体の終端を満たしたsessionだけを数える。初回`t2`到達後にclose / reconnectが
  失敗した試行をinitial connection成功数へ二重計上せず、`connection.initialReady=true`と
  `scenario.result=FAIL`を別fieldで残す。

## スコープ境界

本タスクはPhase 0の測定harness、実測、集計、Gate 0判定だけを所有する。依存taskはない。

本タスクには `scripts/validation/rtc-baseline/compose.yml` とvalidation専用coturn / stub構成を含む。
root `compose.yml` や `compose/` のproduction service wiringには接続しない。

次はスコープ外とする。

- aiortc lifecycle、Frontend reconnect、pipeline、production compose、通信契約の修正
- Pion / Go / codec実装、Pionとの優劣判定、移行ADR
- TURN、IPv6、複数instanceの追加
- raw audio / packet capture / browser profileのcommit

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/roadmap.md:48` から `:63` はPhase 0成果とPhase 1への出口を定義する。
- `documents/migration/pion/implementation-phases.md:35` から `:51` はaiortc 1.14.0、10 / 50 / 100回loop、
  30分通話、browser / candidate別測定、AudioBroker資源を要求する。
- `documents/migration/pion/validation-plan.md:138` から `:174` はGo / Python双方の観測対象、scenario、RSSを
  単独leak判定にしない方針を定義する。本タスクでは現行Python側の同じ項目を取得する。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSignalingApp.py:21` から `:108` は現行status、offer、
  candidate、cleanup、config endpointであり、runnerは公開HTTP境界から操作する。
- `sincromisor-frontend/src/features/rtc/rtcTalkClient.ts:69` から `:133` は現行start / stop / reconnect、
  `sincromisor-frontend/src/features/rtc/diagnostics/rtcStatsReporter.ts:198` 以降はICE candidate / pair統計の
  観測経路である。測定専用production分岐は追加しない。
- 現行契約は `documents/design/contracts/frontend-rtc.md:25` から `:135` を正本とし、baseline runnerが
  contract外payloadを要求しない。

## テスト

- manifest parserは未知version、欠落、負値、非有限値、重複scenario IDを拒否する。
- nearest-rank、成功率、resource収束、欠測判定を固定fixtureでunit testする。
- browser / network runnerは実機testとしてunit testから分離し、固定seedと実行コマンドをartifactへ記録する。
- `npm run gate` とrunner対象のlint / format / unit test、`npm run tasks:index:check`、
  `npm run tasks:check` を実行する。

## ドキュメント同期の要否

公開API、通信契約、production挙動を変更しないため現在設計・契約の同期は不要である。実測値は設計本文へ
転載せず、本taskの `impl.md` / `eval.md` / `artifacts/` を正本とする。公開バレル、生成物、compose、envの変更はない。
