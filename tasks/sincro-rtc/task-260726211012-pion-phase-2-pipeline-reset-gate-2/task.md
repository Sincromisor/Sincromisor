# Pion Phase 2のpipeline resetを実装してGate 2を成立させる

## 背景 / 目的

Phase 1はPion / codec経路をGate 1で確定した。先行するPhase 2の2タスクは、Python / Go間の
MessagePack互換層と、Consul / fallback対応の4つのGo WebSocket clientを独立して実装する。

Phase 2の出口は、各clientが個別に接続できるだけではない。1系統の障害時に4系統を同じgenerationとして
一括resetし、旧generationのpartial recognition、処理中発話、callback、queueを新しい会話へ混入させず、
session close後にWebSocketとgoroutineを残さない必要がある。一方、確定済みchat historyは再接続後も
維持しなければならない。

本タスクでは4 clientを束ねるpipeline coordinator、bounded queue、generation / reset state machine、
backoffを実装し、Python下流serviceを変更せず会話pipelineを通すGate 2 integrationを完了する。
RTC media / DataChannelとの接続はPhase 3に残し、Phase 2ではpipeline固有の障害を独立して評価する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/` に
      `coordinator.go`、`generation.go`、`conversation.go`、`queue.go` を追加する。
      `Coordinator` はsessionごとに1つ作成し、4 client set、generation、state、queue、
      confirmed chat history、generation goroutineのcancel / joinを所有する。
- [ ] stateを `idle`、`connecting`、`running`、`resetting`、`closed` に固定し、許可する遷移を
      `idle -> connecting -> running`、`running -> resetting -> connecting`、
      任意の非closed state `-> closed` に限定する。不正遷移はpanicせずtyped errorと構造化logで拒否する。
- [ ] generationは `uint64` で1から開始し、reset開始時にlock下で先にインクリメントする。
      client result / eventを受ける全callbackは捕捉したgenerationと現在値を比較し、一致しないresultを
      downstream queueへ入れずdrop countとservice名だけを記録する。generation 0とwraparoundは
      sessionをcloseするterminal invariant errorとし、値を再利用しない。
- [ ] 初回接続失敗はgeneration 1の `connecting` 内でclient setを全cleanupしてretryし、generationを増やさない。
      runtimeの `running` client failure 1件につきgenerationを1回だけ増やし、その新generationの
      `connecting` 中に何回dial / partial set failureが起きても同generationのままattemptだけを増やす。
      全4 clientがpublishされた時点でattemptを0へ戻す。publish前clientのeventはそのconnect attemptの
      failureとして全cleanupするが、追加reset / generation incrementを起こさない。
- [ ] 4 clientはExtractor、Recognizer、Processor、Synthesizerの順に接続し、全て成功した場合だけ
      `running` として公開する。途中で失敗した場合は作成済みclientを逆順にclose / joinし、
      部分接続setをpublishしない。次retryまでのbrowser PCMをbufferしない。
- [ ] 1 clientのterminal eventを受けたらsingle-flight resetへ入る。同じgenerationの追加eventは
      resetを重複起動しない。resetは新規inputを拒否し、generation更新、旧context cancel、
      4 client close / join、全transient queueとin-flight stateの破棄、新client set作成の順に行う。
      close / reset中に旧WebSocketへrequestを再送しない。
- [ ] reconnect delayはattempt 0のcap 1秒から始め、
      `cap = min(30秒, 1秒 * 2^attempt)`、実delayはfull jitterの一様分布 `[0, cap]` とする。
      4 client全てが接続するまでattemptを増やし、成功時だけ0へresetする。productionは `crypto/rand` と
      cancel可能なtimerを使い、package-privateなtest constructorだけrandom sourceとwaiterを注入できる。
      public optionは追加しない。retry待機はsession contextで即時cancelできる。
- [ ] pipeline input APIは20 ms / 16 kHz / mono / s16leの640-byte PCMを受ける。
      `running` 以外では `ErrPipelineUnavailable` を返し保存しない。running中のinput queueは25 frame
      （500 ms）に固定し、満杯時は最古の未送信frameを1件dropして最新frameを受理する。
      drop countを記録し、reset時はqueue objectごと交換して旧producer / consumerから切り離す。
- [ ] stage間はgeneration付きの型で
      PCM -> ExtractorResult -> RecognizerResult -> ProcessorRequest / ProcessorResult ->
      SynthesizerResultを接続する。ExtractorResultは同一speechのpending resultをsequence順に結合し、
      `confirmed=true` で発話を閉じる。異なるsession、speech ID逆行、sequence ID重複 / 逆行は
      protocol errorとして同じgenerationをresetする。Extractorのsequence IDはsession内でstrictly increasing、
      current speechがconfirmedになる前の別speech ID、confirmed済みspeechへの追加resultを拒否する。
      RecognizerResultは直前に送信したExtractorResultのsession / speech / sequence / confirmedと完全一致する
      outstanding entryだけを受理し、未知・重複resultをreset理由にする。
- [ ] Recognizerのpartial resultはcurrent user messageを更新してtext outputへ出すがconfirmed historyへ
      追加しない。confirmed resultだけをuser messageとしてhistoryへ1回追加する。
      ProcessorResultはoutstanding ProcessorRequestのsession ID、sequence ID、confirmed、
      request message全fieldと一致することを共通条件とする。中間resultは `end_of_response=false` かつ
      result historyがrequest historyと完全一致する場合だけ受理してresponse messageをtext outputへ出し、
      `voice_text` がnon-emptyならraw bytesをTTSへ転送する。final resultは `end_of_response=true`、
      history長がrequest history+1、prefixがrequest historyと完全一致、
      最終要素がresponse messageと完全一致、response speech IDがrequest messageのspeech IDと一致する場合だけ
      response messageをtext outputへ出してconfirmed historyとして採用する。finalの `voice_text=nil` / emptyは
      TTSへ送らない。不一致、未知sequence、final後の追加resultはgenerationをresetする。
      reset時はcurrent user message、partial recognition、未完了processor response、未送信TTSを破棄し、
      confirmed historyを防御的copyして次generationのProcessorRequestへ引き継ぐ。
- [ ] ProcessorResultの `voice_text` がnon-emptyのときだけ同resultのraw bytesをSynthesizerへ送る。
      `voice_text=nil` / emptyまたは旧generationのresultは送らない。
      SynthesizerResultはencoded voiceとmora timingのtyped outputとして発話順を維持して公開する。
      WAV / AAC / Ogg Opusのcontainer decode、resample、RTP pacingはPhase 3のAudio Output Processorへ残す。
- [ ] text outputとsynthesized outputは各16件のbounded channelとする。textは順序を維持し、
      synthesized resultは発話順を維持する。consumerが満杯を解消しない状態が5秒続いた場合は
      silent dropせずgeneration resetへ移る。これらとinput 25件、retry 1秒 / 30秒はpackage定数とし、
      public runtime configで変更・無制限化しない。testはfake waiter / hookで時間を進め、production定数を
      短縮するoptionを公開しない。backoffはattempt 5以降30秒capへ飽和し、shift / duration overflow前に
      `RetryMax` を返す。
- [ ] external outputはsession lifetimeのchannelを交換しない。各要素を
      `Output[T]{Generation uint64, Value T}` で返す。enqueueはoutput mutex下で現在generationを再確認する。
      resetは同じmutex下でgenerationを更新し、text / synth channelに残る旧要素をnon-blockingに全drainしてから
      unlockする。reset barrier完了後にconsumerが読む要素は新generationだけとなる。
      既にconsumerへ渡った要素の撤回はしないが、envelopeのgenerationで適用前に識別できる。
- [ ] `Close()` はstateをclosedへ確定してからsession contextをcancelし、retry waiter、generation goroutine、
      4 client、queue producerをclose / joinする。Close後のinput、reset、client callbackは状態を変更せず、
      WebSocket再接続を開始しない。normal close、connect中close、reset中close、同時client failure、
      output backpressure timeoutの全経路でclose-onceとなる。
- [ ] `Start` のcontextは初回接続だけでなくsession lifetimeを所有する。cancel時はCoordinatorをclosedへし、
      retry / client / goroutineをjoinする。初回4接続が揃うまで `Start` は同期的に待ち、成功後はnilを返す。
      二重Startは `ErrAlreadyStarted`、Close後Startは `ErrClosed`。初回接続中にcontext cancelされた場合は
      closedとなり `ctx.Err()` を返し、同じCoordinatorを再Startできない。`SubmitPCM` は入力sliceを
      防御的copyしてからqueue所有とする。external output channelはCoordinatorが唯一のclose ownerで、
      全producer join後にtext、synthの順でcloseする。初回接続中に別goroutineが明示 `Close()` した場合、
      待機中の `Start` は `ErrClosed` を返す。
- [ ] fake 4-service serverで会話1往復を通すautomatic integration testを追加する。
      PCM送信、confirmed extraction / recognition、chat history付きprocessor request、
      assistant text、processor raw bytesのsynthesizer転送、encoded voice / mora outputを順に検証する。
      fake serverは依存タスクのPython生成fixtureを使用し、Go独自schemaで成功を偽装しない。
- [ ] reset integration testは各serviceを1つずつ切断し、4 client全close、generation +1、全transient queue空、
      old result drop、backoff、4 client再接続、新しい発話の完了を検証する。
      confirmed historyは維持し、partial user / assistant stateとin-flight voiceは再送されない。
      4 service x normal / decode error / remote closeと、reset中の同時failureをtable-driven testする。
- [ ] current Python下流serviceのproduction codeを変更せず、同じ4 endpointとMessagePack modelを使う
      opt-in Gate 2 integrationを実行する。実推論backendを直接test dependencyにせず、
      既存service processを外部起動してURLをenvironmentから渡す。実行環境、service image / commit、
      talk mode、入力fixture、4 stageの観測結果、reset / close結果を
      `tasks/sincro-rtc/task-260726211012-pion-phase-2-pipeline-reset-gate-2/artifacts/gate-2-result.md`
      に記録する。下記の固定Gate command / stage期待値を満たせなければGate 2はPASSにしない。
- [ ] leak / race testは通常close 10回と各service failure後のresetを反復し、最終active connection 0、
      coordinator goroutineが開始前+5以下、旧generation output 0であることを有限deadlineで検証する。
      `time.Sleep` だけで完了判定せず、join / hook / fake waiterで同期する。
- [ ] `documents/migration/pion/roadmap.md` と `implementation-phases.md` のPhase 2に、
      実装したpackage path、fixture path、Gate 2結果artifactへの導線を同期する。
      `documents/design/contracts/audio-pipeline-websocket.md` と
      `documents/design/backend/services/audio-broker.md` にgeneration reset、queue、
      confirmed history / partial破棄、retry / close semanticsを同期する。
      Python AudioBrokerがproduction正本である状態はPhase 3統合まで維持すると明記する。
- [ ] production code変更とchange comprehension surfaceをcomment auditする。対象は新規
      `internal/pipeline/*.go`、4 client callbackとの接続、protocol DTO変換である。
      `impl.md` のauditは `path`、`symbol / block / decision / flow`、`kind`、`current comment`、
      `reader question`、`required reader knowledge`、`decision（keep / rewrite / delete / add）`、
      `action / omission reason`、`reviewer note` を持つ。package / exported API、state transition、
      generation、event source、queue ownership、drop / backpressure、history確定条件、reset / close順序、
      goroutine joinを説明する。`ClientSetFactory` / client interfaces / `Output` / `NewCoordinator` /
      `Start` / `SubmitPCM` / result channel / `Close` をsymbol単位で全件監査し、責務、入力境界、
      戻り値 / observable output、state別error、side effect、context / slice / channel ownership、
      goroutine lifecycle、非対象を必要に応じてdoc commentへ含める。private、短さ、型、test、
      既存codeの無commentを単独の省略理由にせず、comment追加前に命名、関数分割、型、options object、
      package境界で明確化できるか確認し、構造改善だけをreader-oriented commentの省略理由にしない。
      弱い / stale commentはrewriteまたはdeleteする。`public exportのため追加`、`既存commentで十分`、
      `self-explanatory` だけの定型audit理由を不合格とする。TODOには理由、削除条件、canonical task ID、
      期限または判断基準を含める。評価者は変更対象とcomprehension surfaceを全件照合し、
      不適合ならFAILとする。
- [ ] module rootで `gofmt -l .` が空、`go vet ./...`、`go test ./...`、
      `go test -race ./...`、`go mod tidy -diff` が成功する。Gate 2 integration、repository rootの
      `npm run gate`、`npm run tasks:check` が成功し、実行できなかった検証はGate 2 PASSとして扱わない。

## 設計判断（着手前に確定済み）

### Coordinator APIと所有権

`internal/pipeline` packageの最小APIを次に固定する。Phase 3のRTC packageだけがconsumerになる想定だが、
同一module内のinternal APIとしてexportする。

```go
type Coordinator struct { /* private state */ }

type ExtractorClient interface {
    SendPCM(ctx context.Context, frame []byte) error
    Results() <-chan protocol.ExtractorResult
    Events() <-chan client.Event
}

type RecognizerClient interface {
    SendExtraction(ctx context.Context, value protocol.ExtractorResult) error
    Results() <-chan protocol.RecognizerResult
    Events() <-chan client.Event
}

type ProcessorClient interface {
    SendRequest(ctx context.Context, value protocol.ProcessorRequest) error
    Results() <-chan protocol.ProcessorResult
    Events() <-chan client.Event
}

type SynthesizerClient interface {
    SendResult(ctx context.Context, value protocol.ProcessorResult) error
    Results() <-chan protocol.SynthesizerResult
    Events() <-chan client.Event
}

type ClientSet interface {
    Extractor() ExtractorClient
    Recognizer() RecognizerClient
    Processor() ProcessorClient
    Synthesizer() SynthesizerClient
    Activate(onEvent func(client.Event)) error
    Close() error
}

type ClientSetFactory interface {
    Connect(ctx context.Context, sessionID, talkMode string) (ClientSet, error)
}

type Output[T any] struct {
    Generation uint64
    Value      T
}

func NewCoordinator(factory ClientSetFactory, logger *slog.Logger) (*Coordinator, error)
func (c *Coordinator) Start(ctx context.Context, sessionID, talkMode string) error
func (c *Coordinator) SubmitPCM(frame []byte) error
func (c *Coordinator) TextResults() <-chan Output[protocol.ChatMessage]
func (c *Coordinator) SynthResults() <-chan Output[protocol.SynthesizerResult]
func (c *Coordinator) Close() error
```

`ClientSet` の4 accessor結果、event handler、factory、loggerはnilをconstructor / connect結果で拒否する。
本タスクで `internal/pipeline/client/set.go` にproduction `ClientSetFactory` を実装し、依存タスクの
4 concrete clientをExtractor -> Recognizer -> Processor -> Synthesizer順にConnectする。途中失敗は逆順closeし、
部分setを返さない。test fakeは上記interfaceだけを実装する。

factoryは接続開始時から各client eventを監視し、`Activate` 前のeventをconnect attempt failureとして記録して
全setをcloseする。Coordinatorはstate lock保持中に `Activate(handler)` を呼び、pending failureがあれば
runningへ遷移せず同generationでretryする。成功時はfactory内部のevent gateをbuildingからpublishedへ
原子的に切り替え、Coordinatorが同じstate lock内でrunningへ遷移してからunlockする。
`Activate` 後のevent handlerはCoordinator state lock取得まで待つため、必ずrunningを観測してruntime resetを
1回起こす。`Connect` return直前、returnとActivateの間、Activateとrunning publishの間の各eventをrace testし、
failureが消失・二重処理・誤generation incrementしないことを確認する。

`Start` は初回4接続が揃うまで待つ同期APIとし、caller contextをsession lifetimeの正本にする。
以後の障害は内部reset loopが扱う。Coordinatorを再利用して別sessionを開始することは禁止し、
別sessionは新しいCoordinatorを作る。

production `NewCoordinator` はpackage定数とcrypto jitter / real waiterを使う。
同package testだけが呼ぶ `newCoordinatorWithHooks(factory, logger, jitter, waiter)` をunexportedで置き、
fake timeを注入する。`Option`、公開Config、zero-value補完は追加しない。

client packageへgenerationを持たせる案は採らない。generationは4 clientとstage queueを横断する概念であり、
個別connectionへ分散すると一括resetの原子性を失うためである。

### generationとreset

generationごとに専用context、client set、internal stage channel、goroutine groupを新規作成する。
resetはinternal channelを空にして再利用せず、旧generation object全体をcancel / join後に破棄する。
これにより、channelをdrainした直後に旧producerが書くraceを構造的に防ぐ。

external text / synth channelだけはsession lifetimeで維持し、output mutexをreset barrierとする。
producerはmutex取得後にgenerationを再確認してenqueueし、resetは同じmutex内でgeneration更新と
buffer drainを行う。external valueにもgenerationを付けるため、reset完了後の適用と診断を一意にできる。

client callbackは次のenvelopeに包んでcoordinatorへ渡す。

```go
type generationValue[T any] struct {
    Generation uint64
    Value      T
}
```

現在generationと不一致なら無条件にdropする。speech IDやsequence IDが偶然一致しても救済しない。
in-flight requestはretryせず、new generationで新しいbrowser inputから再開する。

### 会話状態

confirmed historyだけをCoordinator lifetimeへ置き、generation lifetimeから分離する。
current user message、partial recognizer state、processor streaming response、TTS待ちresultは
generation側に置く。processorが返したhistoryは、`end_of_response=true` と
request / responseの整合を検証した時点だけでconfirmed historyへcommitする。

historyのMessagePack fieldをGoが独自に省略・変換せず、依存タスクのprotocol DTOで保持する。
reset通知をChatMessageとしてFrontendへ出すかはPhase 3のDataChannel UX判断であり、本タスクでは
内部event / logだけにする。

### queue / backpressure

- input PCM: 25 frame、drop-oldest、reset中は受理しない。
- stage channel: 各1件。generation pipeline内で順序を保ち、満杯時はblockするがcontext cancelで解除する。
- text / synth output: 各16件、5秒満杯でreset。
- confirmed history: queueではなくsession state。明示上限はPhase 3の会話policyへ残すが、
  defensive copyでgeneration間のmutable共有を避ける。

audio inputとtext / synthesized outputへ同じdrop policyを使わない。低遅延PCMだけdrop-oldestを許可し、
会話結果と音声は黙って欠落させずresetする。

### Gate 2実Python service

opt-in test entrypointは
`internal/pipeline/gate2_python_services_test.go` の `TestGate2PythonServices` に固定する。
module rootから次のcommandで実行する。

```sh
SINCRO_GATE2_EXTRACTOR_ORIGIN=ws://127.0.0.1:8002 \
SINCRO_GATE2_RECOGNIZER_ORIGIN=ws://127.0.0.1:8003 \
SINCRO_GATE2_PROCESSOR_ORIGIN=ws://127.0.0.1:8004 \
SINCRO_GATE2_SYNTHESIZER_ORIGIN=ws://127.0.0.1:8005 \
go test -tags=gate2 -count=1 ./internal/pipeline -run '^TestGate2PythonServices$'
```

4変数は全て必須で、未設定時はskipでなくtest failureとする。値は `ws` / `wss`、non-empty authority、
pathは空または `/` だけを許可し、userinfo、query、fragmentを拒否する。testは各originへの
controllable reverse proxyをlocalhostに起動し、production clientにはproxy endpointをresolverから渡す。
talk modeは外部Difyを必要としない `sincro` に固定する。

入力原本は既に公開repositoryでrecognizer検証に使っているtest fixture
`sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/sample02.wav`
（24 kHz / mono / s16 PCM、SHA-256
`3f9169ec597de0f8fc17b4b6e4f89ea05e8792f42bfb48bfa7c33277318d3759`）に固定する。
test-only helperがWAV data chunkを読み、出力sample `j` に入力sample
`floor(j * 24000 / 16000)` を選ぶdeterministic nearest-neighborで16 kHzへ変換する。
変換後は171,008 byte、SHA-256
`a0375e761e7a483117a7535a5da7ed0ef0036611916a0b0e534403e551789933` でなければtestを開始しない。
640 byteに分割し、最終frameはzero pad、続けて1秒のzero PCMを送る。test helperだけの変換であり、
production resamplerとして再利用しない。
新しい録音やuser音声は追加しない。既存fixtureの由来、公開可否、個人情報を含まないことの確認結果を
`artifacts/gate-2-result.md` に記録し、確認できない場合はGate 2を実行せずPASSにしない。

実serviceの非決定的な推論本文をgolden値にしない。field-level期待値を次に固定する。

- 同じCoordinatorへ上記PCMだけを `SubmitPCM` し、testがstage resultを個別注入してはならない。
  Extractor -> Recognizer -> Processor -> Synthesizerを同じsession / speech / sequence / generationで連続して通す。
- Extractor: 同じsession、16 kHz / int16 / mono、strictly increasing sequenceで
  最終 `confirmed=true` を15秒以内に1件以上返す。既存speech fixtureを使うためtone判定へ依存しない。
- Recognizer: 実ExtractorResultをそのまま受け、同じsession / speech / sequence / confirmed、
  non-empty result textを30秒以内に返す。
- Processor: 実RecognizerResultから作ったrequestを `sincro` endpointへ送り、同じrequest identity、
  non-empty response、`end_of_response=true`、整合したhistoryを15秒以内に返す。
- Synthesizer: 実pipelineの直前ProcessorResult rawを送り、同じspeech ID、non-empty voice / mora、
  positive speaking time、`audio/wav` / `audio/aac` / `audio/ogg;codecs=opus` のいずれかを60秒以内に返す。
- reset: proxyでRecognizer connectionを切断し、generationが1回だけ増加、4 proxyのaccept countが全て+1、
  old output 0、confirmed history維持を確認する。再接続後に同じPCMを再投入して4 stageをもう1回完了し、
  Close後にproxy上のactive connectionが全て0となる。

推論serviceが上記deadlineで結果を返さない、required model / backendが起動できない、4 URLを用意できない場合は
未実行扱いではなくGate 2 FAILである。fixture hash、service commit / image digest、command、各deadlineの
観測値、reset前後generation、connection countを `artifacts/gate-2-result.md` に記録する。

## スコープ境界

本タスクに含むもの:

- 4 clientのpipeline orchestration
- generation、single-flight reset、full-jitter reconnect
- bounded queue、partial / confirmed会話状態
- encoded synthesized voice / moraまでのGate 2 integration
- Phase 2結果artifactと関連migration / contract文書同期

本タスクに含めないもの:

- browser Opus RTPから16 kHz PCMへのdecode / resample接続
- synthesized WAV / AAC / Ogg Opusのdecode、48 kHz resample、20 ms frame化、RTP pacing
- DataChannel dispatcher、telop sample position、audio同期
- session registry、signaling revision、ICE restart、HTTP retry
- production compose、Consul registration、env sample、stable endpoint切替
- Python AudioBroker削除、下流service変更
- Firefox、NAT、impairment、soak、aiortc performance比較

上記はPhase 3または4の責務である。依存タスクはwire contract、discovery、個別connectionを所有し、
本タスクはそれらを変更せずcompositionとGate 2を所有する。

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/implementation-phases.md:78` から `:100` がPhase 2作業とGate 2、
  `documents/migration/pion/roadmap.md:84` から `:100` が次phaseへの条件である。
- `documents/migration/pion/contracts-and-types.md:89` から `:117` が既存MessagePack互換、
  `:119` から `:152` が音声format、`:195` から `:217` がbackpressure / fixture方針である。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/AudioBroker.py:127` から `:191` が
  reconnect値、4 stage queue、text / voice output、`:193` から `:295` が全connectionの作成、
  health判断、closeである。Go側は1系統障害時に全clientをresetする意味だけを継承し、
  polling thread構造とmutable deque共有を移植しない。
- `AudioBroker.py:445` から `:456` はPCM overflow時に古いframeを捨てる。
  Goでは20 ms frameを明示し、25 frameのdrop-oldestへ固定する。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/RecognizerSenderThread.py:30` から `:43` が
  extractor result結合、`TextProcessorSenderThread.py:37` から `:68` がpartial / confirmed user messageと
  history更新である。
- `TextProcessorReceiverThread.py:31` から `:54` がassistant textとTTS queueへの分岐、
  `SynthesizerReceiverThread.py:40` から `:66` がencoded voice受信である。
  container decode / frame splitである同file `:68` 以降はPhase 3へ残す。
- Phase 1の `tasks/sincro-rtc/task-260726150803-pion-codec-poc-gate-1/eval.md` は
  remote close、実process SIGTERM、race、10回closeでregistry / goroutine回収をPASSしている。
  Coordinatorもcontext cancel、close-once、有限deadline、明示joinを維持する。

## テスト

- state machine:
    - 全許可遷移、不正遷移、generation更新、wraparound、single-flight resetをtable-driven testする。
    - ClientSet eventをConnect return前、return / Activate間、Activate / running publish間に注入し、
      connect failureまたはruntime resetの確定した側へ1回だけ分類する。
- conversation:
    - partial -> confirmed user、streaming assistant -> end_of_response、voice_text有無、
      confirmed history commitを固定fixtureで検証する。
    - intermediateは `end_of_response=false` / request history同一、finalは
      `end_of_response=true` / request history+responseの排他的条件とし、各text output / TTS転送を検証する。
    - speech / sequence逆行、session mismatch、重複confirmedをprotocol errorにする。
- reset:
    - 4 serviceそれぞれのfailure、同時failure、connect途中failure、output timeoutで
      generation +1、旧client / queue join、旧output 0を検証する。
    - fake waiter / random sourceで1秒capから30秒capまでとcancelを時間待ちなしで検証する。
- close / race:
    - normal close 10回、reset中close、callback中close、二重closeを `go test -race` で反復する。
    - active WebSocket 0、goroutine baseline +5以下、retry 0を有限deadlineでassertする。
- Gate 2:
    - fixture-backed fake serverでautomatic 4-stage pipeline test。
    - environment URLを使う既存Python service opt-in integrationで実1往復。
    - result、環境、未検証事項を `artifacts/gate-2-result.md` に記録する。
- gates:
    - `gofmt -l .`、`go vet ./...`、`go test ./...`、`go test -race ./...`、
      `go mod tidy -diff`
    - `npm run gate`、`npm run tasks:index:check`、`npm run tasks:check`

## ドキュメント同期の要否

要。Phase 2のexit gateを完了し、pipeline lifecycle / retry / history semanticsが具体化するため、
次を同期する。

- `documents/migration/pion/roadmap.md`
- `documents/migration/pion/implementation-phases.md`
- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/backend/services/audio-broker.md`
- `tasks/sincro-rtc/task-260726211012-pion-phase-2-pipeline-reset-gate-2/artifacts/gate-2-result.md`

Frontend RTC契約、compose、env sample、現在のproduction service設計のGo正本化はPhase 3 / 4まで
実行経路を変えないため、本タスクでは同期しない。
