# Pion最小PoCでRTC移行経路を確定する

## 背景 / 目的

Python / aiortcの機能上の限界だけでなく、WebRTC transport、codec、session lifecycle、会話pipelineの調停まで
Python backendへ集中している現状が、変更コストと障害調査の負担になっている。移行方針としてGo / Pionを採用したい
意思は明確であり、Phase 1で必要なのは業務サービス相当の品質証明ではなく、Sincromisorの基本経路をPionで
成立させられるかの技術確認である。

先行した `task-260726151514-aiortc-baseline-gate-0` は、Linux network namespace、Docker、Firefox、
network impairment、30分soak、詳細resource / latency計測を必須化した結果、validation harnessの構築自体が
主目的になり、3 attempt後も `FAIL` となった。45件のfocused testなど有用な調査成果は実装branchに残っているが、
趣味プロダクトのPion採用判断を止める前提にはしない。

本タスクは現在のFrontend signaling契約を変更せず、ローカルのGoogle Chromeで次の縦切りを確認する。

1. HTTP Offer / AnswerとTrickle ICEでPionへ接続する。
2. browserのOpus RTPをGoで受信してPCMへdecodeする。
3. test PCMをOpusへencodeしてbrowserで再生する。
4. 既存属性の `text_ch` / `telop_ch` でtest JSONを送受信する。
5. sessionをcloseし、同じprocessで次のsessionを作れる。

この縦切りが成立すればPion採用を確定し、下流Python serviceとの接続とproduction運用要件は後続phaseで段階的に
実装する。成立しない場合だけcodec / signalingの代替を再検討する。

## 現状確認

- 現在ブランチにGo RTC server / Pion PoCのproduction codeは存在せず、Phase 1実装は未着手である。
- FrontendのOffer payloadは
  `{sdp,type,talk_mode,session_id?}`、candidate payloadは `{session_id,candidate}` である。
  `offer_request_id` / `offer_revision` は未実装であり、本PoCでは追加しない。
- 現行endpointとDataChannel契約は `documents/design/contracts/frontend-rtc.md` が正本である。
- Gate 0で作成したvalidation harnessは現在ブランチへmergeされていない。本PoCはそれをmerge、修正、実行することを
  前提にせず、必要なら実装branchから個別の小型fixtureだけを参考にする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-server/sincro-rtc-pion-poc/` に独立Go moduleを作り、Pion
      `github.com/pion/webrtc/v4 v4.2.17`、pure Go decoder `github.com/pion/opus v0.1.0`、
      Opus encoder `github.com/pion/mediadevices v0.10.0` を `go.mod` / `go.sum` に固定する。
      通常のstatic buildを使い、READMEには`CGO_ENABLED=1`とC compilerを前提として記載する。
      `dynamic` build tagとsystem libopusは本PoCで使わない。
- [ ] `GET /api/v1/RTCSignalingServer/config.json`、
      `POST /api/v1/RTCSignalingServer/offer`、
      `POST /api/v1/RTCSignalingServer/candidate` を実装し、現行pathと既存JSON fieldを変更しない。
      initial Offerだけを対象とし、既存session ID付きupdate Offerは501と明示errorを返す。
- [ ] PionはFrontendからTrickle ICE candidateと `candidate: null` のend-of-candidatesを受理する。
      PionからFrontendへのcandidate通知endpointは追加せず、candidate収集完了後のAnswerを返すhalf-trickleとする。
      malformed JSON / SDP / candidateはrequestを400で拒否し、processをpanicさせない。
- [ ] ローカルhost candidateを使い、現行FrontendをGoogle Chrome stableで開いてPion PoCへ接続できる。
      `iceConnectionState` が `connected` または `completed` となり、server側session registryが1件になることを
      Debug Console / server logで確認する。
- [ ] browserから受信した連続100 packet以上のOpus RTPをGoで読み、`github.com/pion/opus` でPCMへdecodeする。
      decode結果が48 kHz、monoまたはstereo、非無音であることをunit testと実browser smokeで確認する。
      16 kHz monoへのresampleとPython下流service送信は後続Phase 2の責務とする。
- [ ] 1秒の48 kHz mono test PCMを`github.com/pion/mediadevices/pkg/codec/opus`で20 ms Opus frameへencodeし、
      独立tickerでPion audio trackへ送る。Chrome側でremote audio trackを受信し、AudioContext analyzerで
      非無音を検出する。音質score、厳密なlatency、全VoiceSynthesizer形式decodeは判定しない。
- [ ] Frontendが作成する `text_ch`（ordered / reliable）と
      `telop_ch`（unordered / `maxRetransmits: 0`）をin-band negotiationで受理する。
      serverから各channelへ「DataChannel smoke」の固定test JSONを1件送信し、Frontendの既存parserを通って
      Debug Consoleのchannel logへ同じJSONが出ることを確認する。Frontendからの返信は要求しない。
      `telop_ch`の欠落や順序はPoCの失敗条件にしない。
- [ ] Google Chromeの通常closeを連続10回行い、各回で1つのidempotentなsession closeへ収束して
      PeerConnection、codec、ticker、goroutineを終了する。各回後にsession registryが0、最終goroutine数が
      開始前+5以下となることをserver logで確認する。SIGTERMによるgraceful shutdownとcodec errorからの
      server起点closeはunit / integration testで確認し、manual smokeや管理APIは追加しない。
- [ ] PoCの結果を
      `tasks/sincro-rtc/task-260726150803-pion-codec-poc-gate-1/artifacts/poc-result.md` に記録する。
      上記の接続、inbound decode、outbound encode / playback、DataChannel、10回closeがすべて成立した場合は
      Pion採用を `PASS`、いずれかが成立しない場合は `FAIL` とする。CPU / memory / latencyのaiortc比較は
      判定へ含めない。
- [ ] `PASS` の場合は `documents/design/decisions/ADR-260726-pion-codec-poc.md` に
      「Pion v4 + Pion Opus decoder + mediadevices/libopus encoderを後続実装の出発点とする」と記録する。
      あわせて `documents/design/index.md` からADRへ到達できる導線を追加する。
      `FAIL` の場合は失敗した境界だけを記録し、Pion全体を直ちに棄却せず、codec adapterまたはsignaling方式を
      小さな後続taskで再検討する。
- [ ] `documents/migration/pion/roadmap.md`、`implementation-phases.md`、
      `validation-plan.md`、`risks-and-decisions.md` を本タスクの趣味プロダクト向けphase boundaryへ同期する。
      旧Gate 0の詳細baselineをPion着手の必須条件から外し、Firefox / NAT / ICE restart / impairment /
      soak / performance比較をproduction候補完成後のPhase 3または切替前Phase 4へ移す。
- [ ] 新規Go production codeとchange comprehension surfaceをcomment auditする。対象は本PoCで追加するGo fileだけとし、
      無関係なPython / Frontend既存codeへ拡大しない。変更したflowと、それを理解するために直接読むhelper、
      state、event、lifecycle、data transformationを対象に含める。`impl.md` のauditは `path`、
      `symbol / block / decision / flow`、`kind`、`current comment`、`reader question`、
      `required reader knowledge`、`decision（keep / rewrite / delete / add）`、
      `action / omission reason`、`reviewer note` を持つ。
      exported / public APIでは目的、入力境界、観測可能な出力、失敗条件、副作用、非対象を確認し、内部実装では
      orchestration、state transition、data representation、処理の前後関係、HTTP / WebRTC / codec境界、
      goroutine ownership、close順序を確認する。弱いcommentやstale commentはrewrite / deleteし、TODOには理由、
      削除条件、issue、期限または判断基準を含める。新規codeは現行規約を完全に満たし、private、短さ、型、
      test code、既存codeが無commentであることを単独の省略理由にしない。命名や関数分割などの構造改善だけを理由に
      reader-oriented commentを省略しない。評価者は変更対象とcomprehension surfaceを照合し、不適合ならFAILとする。
- [ ] `gofmt -l .` が空、`go vet ./...`、`go test ./...`、`go test -race ./...`、
      `npm run gate`、`npm run tasks:check` が成功する。manual Chrome smokeの手順と結果を `impl.md` に記録する。

## 設計判断（着手前に確定済み）

### 実装構成

PoCは次の小さな構成に固定する。Phase 3のproduction package構成を先回りして作らない。

- `cmd/pion-poc/main.go`: config load、HTTP server起動、graceful shutdown。
- `internal/signaling/http.go`: 3 endpoint、built Frontendのstatic配信、JSON validation、HTTP error変換。
- `internal/rtc/session.go`: session registry、PeerConnection、DataChannel、close-once。
- `internal/media/audio.go`: RTP read、Opus decode、test PCM encode、20 ms pacing。
- `internal/config/config.go`: HTTP bind、optional STUN URL、有限timeout。

testは各packageと同じdirectoryの`*_test.go`、小型audio fixtureは`testdata/`に置く。
PoC専用の汎用framework、metrics subsystem、validation composeは追加しない。

### signaling

- 現行Frontendを無変更で接続することを優先し、payloadへfieldを追加しない。
- initial OfferでserverがULID session IDを払い出す。`session_id`付きOfferは本PoCで未対応とし501を返す。
  Python版の「update失敗時に新規sessionへfallback」は移植しない。
- AnswerはPionのcandidate収集完了を最大5秒待ってから返す。timeoutは504としsessionをcloseする。
- candidateはAnswer待機中もsession ID確定後に受理できる。unknown / closed sessionは
  現行契約どおりHTTP 200の`{"status":false,"reason":"..."}`を返し、新規sessionへfallbackしない。

### ローカル実行経路

- repository rootで`npm --prefix ./sincromisor-frontend run build`を実行し、Frontendを`dist/`へbuildする。
- aiortc版や既存composeを停止して同じportとの競合を避け、
  `cd sincromisor-server/sincro-rtc-pion-poc`でmodule rootへ移動してから
  `go run ./cmd/pion-poc --http 127.0.0.1:8080 --frontend-dir ../../sincromisor-frontend/dist`
  でPoCを起動する。PoCは`/api/v1/RTCSignalingServer/**`をAPIとして扱い、それ以外は指定した
  build済みFrontendを同一originで配信する。
- Chrome stableで`http://127.0.0.1:8080/simple-vrm/index.html`を開く。production compose / Consul /
  Caddyは変更せず、PoC専用proxyも追加しない。
- static directory不在、API pathとの衝突、listen失敗は起動時errorとし、READMEへ上記手順と停止方法を記載する。

### DataChannel smoke payload

両payloadはserverからFrontendへchannel open後に1回だけ送る。Frontend production codeは変更せず、
Debug Consoleの`text_ch` / `telop_ch` logに同じJSONが表示され、invalid payload logが出ないことを観測点とする。

- `text_ch`:
  `{"message_id":"pion-poc-1","message_type":"assistant","speaker_id":"pion-poc","speaker_name":"Pion PoC","speech_id":1,"expression_code":0,"message":"DataChannel smoke","created_at":0}`
- `telop_ch`:
  `{"speech_id":1,"timestamp":0,"message":"DataChannel smoke","vowel":"a","text":"DataChannel smoke","length":1,"new_text":true}`

### codec / media

- inbound decodeはpure Goの`github.com/pion/opus v0.1.0`を採る。cgo範囲をoutbound encoderだけへ限定するため。
- outbound encodeは`github.com/pion/mediadevices v0.10.0`のOpus encoderを採る。
  通常のstatic buildを使い、cgo toolchain以外のsystem libopusを要求しない。GStreamer比較は行わない。
  encoderが開発machineでbuild不能な場合はGate 1 `FAIL`ではなく、
  encoder adapterだけの後続task候補として記録する。ただし本タスクの技術判定はoutbound playback未成立のため
  `FAIL`とする。
- test PCMはruntime生成する440 Hz sine、48 kHz mono、1秒、-12 dBFSとし、binary fixtureをcommitしない。
- outbound pacingは20 ms tickerをsession contextで所有する。audio inputの到着をclockとして使わない。
- RTP reorder、wraparound補正、NACK、PLC、RTCP metrics、resample、mora同期はproduction品質の実装であり、
  本PoCでは扱わない。Pionから受け取ったpacket順にdecodeし、read errorでsessionをcloseする。

### 採用判断

本タスクの `PASS` は「Pionを採用して次の実装へ進む」であり、「本番品質を証明した」ではない。
性能値や100回以上のstress testがないことを理由に `FAIL` にしない。後続Phase 2 / 3で実際のpipelineと
session ownershipを実装し、Phase 4で切替に必要なbrowser / NAT / soak確認を行う。

## スコープ境界

本タスクに含むもの:

- 現行signaling schemaとローカルhost candidateによるPion接続
- Opus inbound decode、test PCM outbound encode / playback
- 2 DataChannelのtest message
- 10回のclose smoke、unit / race test
- Pion採用判断、ADR、移行文書のphase boundary同期

本タスクに含めないもの:

- aiortc性能baselineの再取得、Gate 0 validation harnessのmerge / 修正 / 実行
- Frontendのpayload / reconnect state変更
- `offer_request_id`、`offer_revision`、同一session ICE restart、retry cache / tombstone
- public IPv4 rewrite、固定UDP mux、Docker / NAT / firewall、TURN、IPv6
- Firefox、network impairment、NACK / PLC比較、RTP reorder / wraparound、RTCP metrics
- 30分soak、100回loop、CPU / RSS / heap / fd / socket計測、sanitizer、multi-architecture build
- VoiceSynthesizerのWAV / AAC / Ogg全形式decode、下流Python service接続
- production compose / Consul登録、stable endpoint切替、aiortc削除

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/features/rtc/rtcNegotiation.ts:6` から `:11` が現行Offer schema、
  `:56` から `:94` がOffer HTTP境界である。本PoCのために変更しない。
- `sincromisor-frontend/src/features/rtc/rtcIceCandidateSender.ts:6` から `:45` がcandidate schemaと送信処理である。
  revision fieldや新しいretry stateを追加しない。
- `sincromisor-frontend/src/features/rtc/rtcBoundarySchema.ts:17` から `:26` がAnswer / candidate response parserである。
  PoC responseをこのschemaへ合わせる。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSignalingApp.py:21` から `:108` が現行endpointと
  response shapeを実装している。Go PoCはpath / JSONだけを互換にし、Pythonのprocess modelを移植しない。
- `documents/design/contracts/frontend-rtc.md:25` から `:47` がendpoint / DataChannel属性、
  `:61` から `:107` がpayloadの正本である。
- `sincromisor-frontend/src/features/rtc/rtcDataChannels.ts:32` から `:75` はDataChannelを受信専用で扱う。
  本PoCはserverからFrontendへの片方向messageだけを確認し、echo用のFrontend変更を加えない。
- `documents/migration/pion/implementation-phases.md:35` から `:100` の旧Gate 0 / 1は業務サービス相当の
  検証をPhase 1へ集約している。本タスクで上記の最小PoCと後段検証へ再配分する。

## テスト

- signaling unit:
    - config response、valid Offer、malformed JSON / SDP、session ID付きOffer=501。
    - valid candidate、end-of-candidates、unknown / closed session=200 + `status:false`。
    - candidate gathering timeout=504とsession close。
- media unit:
    - 生成PCMが48 kHz mono / 1秒 / 非無音。
    - encode結果が空でなく20 ms frame単位で生成される。
    - known Opus packetをdecodeして非無音PCMを得る。
- lifecycle unit / race:
    - browser相当のnormal close、SIGTERM graceful shutdown、codec error、二重closeでregistryが0になる。
    - ticker / media goroutineがcontext cancelで終了する。
- manual smoke:
    - build済みの現行FrontendをPoCから同一origin配信し、Google Chrome stableで接続、
      remote non-silent audio、2 DataChannel、closeを10回確認する。
- repository:
    - `gofmt -l .`、`go vet ./...`、`go test ./...`、`go test -race ./...`、`npm run gate`、
      `npm run tasks:index:check`、`npm run tasks:check`。

## ドキュメント同期の要否

公開signaling schemaは変更しないため `documents/design/contracts/frontend-rtc.md` のpayload更新は不要である。
一方、移行判断とphase boundaryを変更するため、`documents/migration/pion/roadmap.md`、
`implementation-phases.md`、`validation-plan.md`、`risks-and-decisions.md` と
`documents/design/decisions/ADR-260726-pion-codec-poc.md`、`documents/design/index.md` を同期する。
production compose、env sample、現在のPython service設計は変更しない。
