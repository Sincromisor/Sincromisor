# Pion Phase 2のGo pipeline WebSocket clientを実装する

## 背景 / 目的

Phase 1はPion / codecの最小経路をGate 1で確定した。依存タスク
`task-260726211002-pion-phase-2-messagepack-contract` は、既存Python下流serviceとのMessagePack境界を
限定DTOとgolden fixtureで固定する。

次に必要なのは、SpeechExtractor、SpeechRecognizer、TextProcessor、VoiceSynthesizerへGoから直接接続する
4 clientである。現在のPython `AudioBroker` はservice discovery、WebSocket接続、sender / receiver thread、
queue、全体系reconnectを1 classへ集約しているため、接続単体の失敗とpipeline全体のresetが分離されていない。

本タスクでは、Consul lookupとfallbackを共通化し、各clientを「1接続のI/O、protocol encode / decode、
health、close」だけに限定する。1 client障害時の4 client一括reset、generation、backoffは後続タスクに置き、
個別clientが独自に再接続しない構造を確定する。

## 完了条件（受け入れ条件）

- [ ] `github.com/coder/websocket v1.8.15` を直接dependencyとして
      `sincromisor-server/sincro-rtc-pion-poc/go.mod` / `go.sum` に固定する。
      `context.Context` 対応、binary message、ping、close handshakeを同libraryで実装し、
      deprecatedな `golang.org/x/net/websocket` や独自WebSocket実装を追加しない。
- [ ] `internal/pipeline/discovery/resolver.go` に `Resolver` interface、`Endpoint`、
      Consul HTTP APIを使うresolverを実装する。`Resolve(ctx, serviceName)` は
      `/v1/health/service/{serviceName}?passing=true` からpassing instanceだけを取得し、
      複数件なら一様ランダムに1件選ぶ。乱数選択関数をconstructorへ注入可能にし、
      productionでは `crypto/rand` を使う。
- [ ] Consul URL未設定、HTTP / timeout / decode error、passing instance 0件の場合は
      4 service共通のfallback host / portへ切り替える。fallbackも欠損または不正ならservice名を含むerrorを返す。
      Consulの5xxや不正bodyを「worker 0件」と偽装せず、fallbackを使った理由をtyped reasonとしてcallerへ返す。
      credential、response body、service payloadはerror / logへ含めない。
- [ ] Consul base URLは `http` / `https`、non-empty authority、pathは空または `/` だけを許可し、
      userinfo、query、fragmentをconstructorで拒否する。設定不正はfallbackせず起動時errorとする。
      Consul HTTP clientはredirectを拒否し、redirect responseはlookup failureとしてfallback reasonへ残す。
- [ ] Consul response bodyは1 MiB、service addressはhostまたはIP、portは1..65535へ制限する。
      scheme付きaddress、path、query、userinfo、空hostを拒否する。WebSocket URLはresolverが返した
      host / portと固定endpoint pathだけから `url.URL` で構築し、文字列連結で外部値をpathへ混ぜない。
- [ ] `internal/pipeline/client/` に共通 `Config` / `Event` / connection lifecycleと、
      `extractor.go`、`recognizer.go`、`processor.go`、`synthesizer.go` を追加する。
      各constructorはvalidation済みconfig、resolver、loggerを受けるがnetwork I/Oを開始しない。
      `Connect(ctx)` が1接続を開始し、各clientは同時に1つのreader loopだけを所有する。
- [ ] endpointを次に固定する。Extractorはtalk mode `chat` なら
      `max_silence_ms=1000`、`sincro`なら`600`を付け、それ以外のtalk modeをconstructorで拒否する。
      Recognizerは `/api/v1/SpeechRecognizer/recognize`、Processorは
      `/api/v1/TextProcessor/{chat|sincro}`、Synthesizerは
      `/api/v1/VoiceSynthesizer/synthesize` を使う。path変更やGo専用adapter endpointは追加しない。
- [ ] Extractor clientはconnect直後の最初のbinary messageとして
      `protocol.ExtractorInitialize` を1件だけ送り、その後は16 kHz mono s16leのraw PCM binaryだけを送る。
      空frame、奇数byte、20 ms相当の640 byteでないframeを送信前にrejectする。
      responseは `protocol.ExtractorResult` としてdecodeする。
- [ ] Recognizer clientは `protocol.ExtractorResult` をMessagePack binaryで送り、
      `protocol.RecognizerResult` を受ける。異なるsession ID、speech ID負値、sequence ID負値、
      voice formatが `int16` / 16 kHz / 2 byte / mono以外のrequestを送信前にrejectする。
- [ ] Processor clientは `protocol.ProcessorRequest` を送り、`protocol.ProcessorResult` を受ける。
      talk modeはURLとclient configで一致させる。Synthesizer clientは
      `ProcessorResult.Raw` を変更せず送り、`protocol.SynthesizerResult` を受ける。
      `Raw` が空、processor decodeが未成功、session IDがclientと異なる場合は送信しない。
- [ ] 各clientのsendは同期APIとし内部send queueを持たない。result streamとhealth eventは別channelにし、
      result channelはbuffer 0、event channelはbuffer 1に固定する。
      readerがresult consumerにblockしてもsession cancelで必ず解除される。channelをcloseするowner、
      error eventを1回だけ通知する条件、goroutine join責務を実装とcommentで明示する。
- [ ] `SetReadLimit` を接続直後・reader開始前に適用し、Extractor 2 MiB、Recognizer 1 MiB、
      Processor 2 MiB、Synthesizer 32 MiBをclient別の固定上限とする。0や設定による無制限化を許可しない。
      上限ちょうどのbinary messageはprotocol decodeへ渡し、上限+1 byteはconnectionをcloseして
      `EventMessageTooLarge` を1回通知する。request encode後のwrite payloadにも同じservice別上限を適用する。
- [ ] timeout既定値はdial 5秒、write 5秒、ping interval 10秒、ping timeout 5秒、close handshake 2秒に固定し、
      typed `Config` で正数を検証する。serverが通常無送信でもread inactivityだけでは失敗させず、
      ping失敗、binary以外のmessage、protocol decode error、write error、remote closeをterminal eventとする。
      terminal event後は同じconnectionへsendせず、個別client内でreconnectしない。
- [ ] lifecycle stateを `new`、`connecting`、`open`、`closed` に固定する。
      `Connect` は `new` から1回だけ許可し、二重呼出しは `ErrAlreadyConnected`、send-before-openは
      `ErrNotConnected`、Close後のConnect / sendは `ErrClosed` を返す。Close-before-Connectはその場で
      closedへ遷移して両channelをcloseする。ConnectとCloseが競合した場合はCloseを優先し、
      確立途中connectionをclose / joinしてConnectは `ErrClosed` を返す。
      明示Closeとparent context cancelはterminal eventを出さず、予期しないremote close / ping / read /
      write / decode失敗だけがeventを1回出す。
- [ ] `Close()` はidempotentにcontext cancel、close handshake / `CloseNow` fallback、reader / ping goroutine join、
      result / event channel closeへ収束する。Connect途中、正常close、remote close、decode error、send timeout、
      parent context cancelの全経路でWebSocketとgoroutineを残さない。
- [ ] unit / integration test用にlocalhostのHTTP / WebSocket serverとfake resolverを使い、4 endpointのpath、
      query、binary payload、initialization順、typed result、timeout、terminal event、二重closeを検証する。
      production clientからtest server実装をimportできる構造にしない。
- [ ] `documents/design/contracts/audio-pipeline-websocket.md` にGo clientのendpoint利用、
      binary-only、ping / timeout、個別clientはreconnectしない責務境界を同期する。
      `documents/design/backend/services/audio-broker.md` には移行中のGo client packageと、
      Python AudioBrokerをまだproduction置換していないことを明記する。
- [ ] production code変更とchange comprehension surfaceをcomment auditする。対象は新規
      `internal/pipeline/discovery/*.go`、`internal/pipeline/client/*.go` とprotocol APIの直接利用箇所である。
      `impl.md` のauditは `path`、`symbol / block / decision / flow`、`kind`、`current comment`、
      `reader question`、`required reader knowledge`、`decision（keep / rewrite / delete / add）`、
      `action / omission reason`、`reviewer note` を持つ。package / exported API、Consul / WebSocket境界、
      fallback、timeout、goroutine ownership、event source、close順序、binary変換を説明する。
      `Resolver` / `Endpoint` / `NewResolver`、4 client constructor、`Connect`、`Results`、`Events`、
      各send、`Close` をsymbol単位で全件監査し、責務、入力境界、戻り値 / observable output、state別error、
      side effect、channel / slice ownership、goroutine開始・終了、提供しないretry責務を必要に応じて記述する。
      private、短さ、型、test、既存codeの無commentを単独の省略理由にせず、comment追加前に命名、関数分割、
      options object、package境界で明確化できるか確認し、構造改善だけをreader-oriented commentの
      省略理由にしない。弱い / stale commentはrewriteまたはdeleteする。
      TODOには理由、削除条件、canonical task ID、期限または判断基準を含める。
      評価者は変更対象とcomprehension surfaceを全件照合し、不適合ならFAILとする。
- [ ] module rootで `gofmt -l .` が空、`go vet ./...`、`go test ./...`、
      `go test -race ./...`、`go mod tidy -diff` が成功する。repository rootで
      `npm run gate`、`npm run tasks:check` が成功する。

## 設計判断（着手前に確定済み）

### packageとAPI境界

追加構成を次に固定する。

- `internal/pipeline/discovery/resolver.go`: service discoveryだけを所有する。
- `internal/pipeline/client/client.go`: config、common connection、event、close-once。
- `internal/pipeline/client/extractor.go`
- `internal/pipeline/client/recognizer.go`
- `internal/pipeline/client/processor.go`
- `internal/pipeline/client/synthesizer.go`

client packageは依存タスクの `internal/pipeline/protocol` だけをserializationに使用する。
巨大な汎用generic clientやservice名でswitchする単一clientは作らない。各serviceは初期message、
send型、receive型が異なり、compile-timeに誤配線を検出したいためである。

discoveryのschemaとconstructorを次に固定する。

```go
type Service string

const (
    ServiceExtractor  Service = "SpeechExtractor"
    ServiceRecognizer Service = "SpeechRecognizer"
    ServiceProcessor  Service = "TextProcessor"
    ServiceSynthesizer Service = "VoiceSynthesizer"
)

type EndpointSource string // "consul" または "fallback"
type FallbackReason string // "consul_disabled" / "request_failed" / "no_healthy_instance"

type Endpoint struct {
    Host           string
    Port           uint16
    Source         EndpointSource
    FallbackReason FallbackReason // Source=="consul" のとき空
}

type Resolver interface {
    Resolve(ctx context.Context, service Service) (Endpoint, error)
}

type ResolverConfig struct {
    ConsulBaseURL string
    FallbackHost  string
    FallbackPort  uint16
    RequestTimeout time.Duration
}

func NewResolver(cfg ResolverConfig, client *http.Client, choose func(int) (int, error)) (Resolver, error)
```

`choose` のproduction実装は `crypto/rand.Int` による `[0,n)` の一様選択とする。nil clientは
redirect拒否を組み込んだ専用clientを作る。nil chooserはproduction chooserを使う。
fallback成功はerrorでなく `Endpoint.Source` / `FallbackReason` で観測し、fallbackも使えない場合だけerrorを返す。

client packageのschemaを次に固定する。

```go
type Service string
type EventKind string

const (
    EventRemoteClose     EventKind = "remote_close"
    EventPingFailed      EventKind = "ping_failed"
    EventReadFailed      EventKind = "read_failed"
    EventWriteFailed     EventKind = "write_failed"
    EventDecodeFailed    EventKind = "decode_failed"
    EventMessageTooLarge EventKind = "message_too_large"
)

type Event struct {
    Service Service
    Kind    EventKind
    Err     error
}

type Config struct {
    SessionID      string
    TalkMode       string
    DialTimeout    time.Duration
    WriteTimeout   time.Duration
    PingInterval   time.Duration
    PingTimeout    time.Duration
    CloseTimeout   time.Duration
}

func NewExtractor(cfg Config, resolver discovery.Resolver, logger *slog.Logger, now func() time.Time) (*Extractor, error)
func NewRecognizer(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Recognizer, error)
func NewProcessor(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Processor, error)
func NewSynthesizer(cfg Config, resolver discovery.Resolver, logger *slog.Logger) (*Synthesizer, error)

func (c *Extractor) Connect(ctx context.Context) error
func (c *Extractor) SendPCM(ctx context.Context, frame []byte) error
func (c *Extractor) Results() <-chan protocol.ExtractorResult
func (c *Extractor) Events() <-chan Event
func (c *Extractor) Close() error

func (c *Recognizer) SendExtraction(ctx context.Context, value protocol.ExtractorResult) error
func (c *Processor) SendRequest(ctx context.Context, value protocol.ProcessorRequest) error
func (c *Synthesizer) SendResult(ctx context.Context, value protocol.ProcessorResult) error
```

Recognizer / Processor / SynthesizerもExtractorと同じ `Connect` / `Results` / `Events` / `Close` を持ち、
`Results` の型だけ順に `protocol.RecognizerResult`、`protocol.ProcessorResult`、
`protocol.SynthesizerResult` とする。

`Connect` に渡したcontextはconnection lifetimeを所有し、cancel時は明示Close相当でeventなしにclose / joinする。
Extractorの `now` はnilを拒否し、`Connect` が初期messageをencodeする直前に1回だけ呼んだUnix秒を
`ExtractorInitialize.StartAt` とする。constructor時刻は使わない。logger nilもconstructor errorにする。
Configのdurationは受け入れ条件の既定値だけを許可するのではなく、testで短縮可能な正数とし、
zero / 負数をerrorにする。read / write byte上限はConfigへ公開せず固定する。

send methodは具体clientごとに上記名へ固定する。
外部のpipeline coordinatorがconnectionを所有し、`Close()` をjoinする。clientはretry backoff、
generation、chat history、複数clientのhealth判断を持たない。

### discovery / fallback

Consul client libraryは追加せず、必要なhealth endpointを標準 `net/http` で限定実装する。
Phase 2でcatalog / watch / registrationまで依存へ取り込む必要がないためである。

service名は定数 `SpeechExtractor`、`SpeechRecognizer`、`TextProcessor`、`VoiceSynthesizer` のみ許可する。
Consulで複数passing instanceがある場合は現行Pythonのrandom worker semanticsを維持する。
fallbackは現行 `SINCRO_RTC_FALLBACK_HOST` / `PORT` と同じ単一host / portを4 serviceへ使う。
compose / env loaderへのGo service wiringはPhase 4の切替構成で行うため、本タスクはtyped configとunit testまでとする。

### I/Oと失敗

- 全application messageはWebSocket binary。text messageはprotocol violationとしてterminal eventにする。
- WebSocket connectionにつきreaderは1 goroutine、writerはcaller側の同期sendだけとし、
  同時sendはmutexで直列化する。
- result deliveryでblock中もclient context cancellationをselectし、shutdownを優先する。
- 最初のterminal failureだけをbuffer 1のevent channelへ通知し、同じfailureをreader / ping / sendから重複通知しない。
- close errorは既に発生したterminal errorを上書きしない。close handshake timeout後は強制closeしてjoinする。
- 個別clientは自動reconnectしない。4 clientを同じgenerationへ揃える責務は後続taskに一元化する。
- result / event channelはclientが唯一のclose ownerであり、reader / ping / sendが直接closeしない。
  cleanup完了後にresult、eventの順で1回だけcloseする。terminal eventはevent channel closeより前に送る。

## スコープ境界

本タスクに含むもの:

- Consul health lookupと共通fallback
- 4つのtyped WebSocket client
- binary protocol I/O、timeout、ping、terminal event、close-once
- stub serverを使うcontract / lifecycle test

本タスクに含めないもの:

- 4 client一括作成 / reset、generation、retry backoff
- pipeline queue、chat history、partial speech state、stage間orchestration
- 実Python 4 serviceを通すGate 2 end-to-end判定
- synthesized voiceのcontainer decode / resample / Opus RTP送出
- Pion sessionとの接続、DataChannel送信
- compose / env sample / Consul registration、production endpoint切替
- Python AudioBrokerまたは下流serviceの変更・削除

依存タスクがwire DTO / codecを所有し、本タスクはconnection単位のtransportを所有する。
後続 `task-260726211012-pion-phase-2-pipeline-reset-gate-2` がこの4 clientを同一generationとして束ねる。

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/roadmap.md:84` から `:100` と
  `documents/migration/pion/implementation-phases.md:78` から `:100` がPhase 2のclient、Consul、
  fallback、timeoutとGate 2の責務である。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/AudioBroker.py:297` から `:321` が
  現行Consul lookup / fallback、`:323` から `:443` が4 endpointとsender / receiver作成である。
  Go clientはendpointとfallback semanticsを維持し、Python thread構造は移植しない。
- `AudioBroker.py:127` から `:160` が1秒 / 30秒reconnect値とstate lock、
  `:250` から `:295` が1 client不健全時の全closeである。本タスクはterminal eventまでを実装し、
  reset / backoffを後続へ残す。
- `sincromisor-server/speech-extractor/SpeechExtractorProcess.py:54` から `:70`、
  `speech-recognizer/SpeechRecognizerProcess.py:67` から `:114`、
  `text-processor/TextProcessorProcess.py:57` から `:110`、
  `voice-synthesizer/VoiceSynthesizerProcess.py:62` から `:96` が現行WebSocket endpointである。
- `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizerWorker.py:41`
  から `:71` に合わせ、Synthesizerへは独自requestでなくprocessor resultのraw bytesを送る。
- `sincromisor-server/sincro-rtc-pion-poc/internal/rtc/session.go` のSession lifecycleと
  `internal/rtc/manager.go` のclose-onceはPhase 1でrace / SIGTERM評価済みである。
  pipeline clientもcontext cancelと明示joinを採用するが、RTC packageへclient責務を混ぜない。

## テスト

- discovery:
    - passingだけを候補にし、注入chooserが指定したinstanceを返す。
    - Consul timeout / 5xx / malformed / emptyでfallbackし、fallback欠損時はtyped error。
    - body、address、port上限とURL組み立てをtable-driven testする。
- protocol:
    - 4 endpointへ期待path / queryで接続し、全messageがbinaryである。
    - Extractor initが最初の1件、PCMが2件目以降になる。
    - 依存タスクのfixtureと同値のtyped request / resultが往復する。
    - text message、malformed MessagePack、session mismatch、format mismatchをrejectする。
- lifecycle:
    - dial / write / ping / close timeoutをfake clockまたは同期hookで検証し、`time.Sleep`へ依存しない。
    - normal close、remote close、decode error、二重close、connect中cancelでeventが最大1件、
      connection / goroutineが0へ収束する。
    - `go test -race` でsend、terminal event、Closeの競合を検証する。
- gates:
    - `gofmt -l .`、`go vet ./...`、`go test ./...`、`go test -race ./...`、
      `go mod tidy -diff`
    - `npm run gate`、`npm run tasks:index:check`、`npm run tasks:check`

## ドキュメント同期の要否

要。既存endpoint / MessagePack payloadは変更しないが、Go clientのbinary-only、timeout、ping、
個別clientはreconnectしない責務が増えるため、
`documents/design/contracts/audio-pipeline-websocket.md` と
`documents/design/backend/services/audio-broker.md` を同期する。

production compose、env sample、Frontend RTC契約はまだ実行経路を変更しないため同期不要である。
