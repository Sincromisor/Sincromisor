# Pion Gate 3下流サービス契約ハーネスを実装する

## 背景 / 目的

4つのPython下流サービスとのMessagePack契約と、切断後のpipeline再接続を検証する部品を、
ブラウザーやシグナリング障害から独立して実装する。Gate 3本番実測は実サービスを使うが、
ハーネスの自己検証は通信互換な契約サービスで決定的に行う。

## 完了条件（受け入れ条件）

- [ ] `internal/gate3/pipelinecontract`にSpeechExtractor、SpeechRecognizer、TextProcessor、
      VoiceSynthesizerの4契約サービスを実装し、既存MessagePack固定データと同じkey・型を検査する。
- [ ] 各caseを「generation 1の正常turn、arm後の障害attempt、generation 2の復旧turn」の順で実行する。
      2つの正常turnについて`speech_id`、`sequence_id`、session、確定済み履歴、
      TextProcessorからVoiceSynthesizerへのbyte同一性を台帳へ保存する。障害attemptは後述の
      service別prefixだけを許し、余分なframe、順序違反、ID不一致、未消費操作をerrorにする。
- [ ] `internal/gate3/wsproxy`はサービスごとに透過、`close`、`malformed`、`held-close`の有限規則列を持つ。
      正常turn完走後かつrequest処理中でない時だけ規則列をarmできる。規則はarm後に一致した最初の
      frameだけで先頭から消費し、scenario終了時の未消費規則をerrorにする。
- [ ] 4サービス×3障害の各caseで、障害発生後の最初のWebSocket upgradeを1回拒否して
      pipelineを`connecting`へ遷移させる。4 clientの一括reset、同じpipeline session ID、
      `SubmitPCM`の`ErrPipelineUnavailable`、旧generation出力なし、復旧後の新しいturn完走を確認する。
- [ ] 各caseで`sincro_rtc_pipeline_reconnects_total`の障害発生元serviceについて
      `result="start"`と`result="success"`が開始値から各1増え、他serviceのseriesが増えないことを確認する。
- [ ] `internal/observability.Registry.PipelineReconnect`はproduction pipelineが渡す
      `SpeechExtractor`、`SpeechRecognizer`、`TextProcessor`、`VoiceSynthesizer`をそれぞれ
      `extractor`、`recognizer`、`processor`、`synthesizer`へ一意に変換する。未知値の
      `extractor` fallbackと既存の固定label集合は維持し、4値と未知値の回帰試験を追加する。
- [ ] 専用`consul agent -dev`を`127.0.0.1:8500`で子プロセス起動し、4 proxyだけを固定service名で登録する。
      port使用中は既存Consulを変更せずerrorにし、終了時は登録解除、proxy join、Consul terminate / `Wait`を行う。
- [ ] 契約サービスへ直接接続する試験と、4 proxyを通す所有者間結合試験を分け、後者で
      Consul health応答、各proxyのaccepted / active / closed接続数、runtime panic callbackを観測し、
      後述の一意な期待値と照合する。
- [ ] 変更対象と変更理解範囲のコメント点検を`impl.md`へ全件記録する。

## 設計判断（着手前に確定済み）

- packageは`internal/gate3/pipelinecontract`、`internal/gate3/wsproxy`、
  `internal/gate3/consuldev`へ分ける。ブラウザーとPion processの起動は後続タスクが所有する。
- 4 service名は`SpeechExtractor`、`SpeechRecognizer`、`TextProcessor`、`VoiceSynthesizer`に固定する。
- 契約サービスは
  `internal/pipeline/protocol/testdata/{extractor_result,recognizer_result,text_processor_request,text_processor_result,voice_synthesizer_result}.msgpack`
  とExtractor初期化固定データを再利用し、別schemaを作らない。
- `close`は最初のrequest受信後、response前にactive WebSocketを閉じる。`malformed`は最初の
  server→client結果を不正なMessagePackへ置換する。`held-close`は有効なresponseをproxy内へ保持した後、
  接続を閉じて保持bytesを破棄する。いずれも次のWebSocket upgradeを1回503で拒否し、その後は透過へ戻る。
- proxyは初期状態を透過とし、generation 1の正常turnで3出力を受信した後に
  `Set.Arm([]Rule)`で対象serviceの規則1件を設定する。`Arm`は空列、既存の未消費規則、
  またはclient→server request処理中なら`ErrArmConflict`を返し、規則を変更しない。
  `MatchOrdinal=1`はarm後に対象serviceへ届く最初のrequest / response交換を基準とする。
- 新規APIは次の最小契約に固定する。
    - `pipelinecontract.New(Config{FixturesDir, ListenHost}) (*Set, error)`、
      `Set.Addresses()`、`Set.Transcript()`、`Set.Verify()`、`Set.Close(context.Context)`。
    - `wsproxy.NewSet(Config{Upstreams}) (*Set, error)`、`Set.Addresses()`、
      `Set.Arm([]Rule)`、`Set.Ledger()`、`Set.VerifyConsumed()`、`Set.Close(context.Context)`。
    - `Rule`は`Service`、`Action=close|malformed|held-close`、`MatchOrdinal=1`、
      `RejectReconnects=1`を持つ。方向はserver→clientに固定し、任意predicateは受理しない。
    - `consuldev.Start(Config{Binary, WorkDir, Services}) (*Agent, error)`、
      `Agent.Close(context.Context)`。`Services`は
      `map[discovery.Service]discovery.Endpoint`で、4つの正規serviceを過不足なく要求する。
      service IDは`gate3-speech-extractor`、`gate3-speech-recognizer`、
      `gate3-text-processor`、`gate3-voice-synthesizer`へ固定する。
- `consuldev.Start`は開始前に`127.0.0.1:8500`へbind検査し、使用中ならprocess起動やHTTP変更をせず
  `ErrPortInUse`を返す。`process.New(process.Command{Path: Binary,
Args: []string{"agent","-dev","-bind=127.0.0.1","-client=127.0.0.1","-http-port=8500"},
Env: []string{}, Dir: WorkDir})`を1回だけ生成して`Start()`し、5秒以内に
  `GET /v1/status/leader`が2xxかつ空でないleaderを返すまで待つ。その後、
  `PUT /v1/agent/service/register`へID、Name、Address、Portだけを持つ4登録を上記順序で行う。
  health checkは追加せず、node healthがpassingであることを使う。
- readiness失敗または部分登録失敗時は、登録済みIDを逆順で解除してから`Owner.Close()`を必ず呼び、
  元errorとcleanup errorを`errors.Join`する。`Agent.Close(ctx)`は4 IDを逆順で解除した後、
  ctxが失効していてもcontextを取らない`Owner.Close()`を必ず実行してprocessとwaiterをjoinする。
- 判定用errorは`ErrRuleUnconsumed`、`ErrArmConflict`、`ErrProtocol`、`ErrIdentity`、
  `ErrPortInUse`、`ErrProcess`、`ErrReadiness`、`ErrRegistration`、`ErrCleanup`とし、
  詳細をwrapして`errors.Is`可能にする。`Close`は冪等で、複数cleanup errorを
  `errors.Join`して返す。Consul操作との対応は次に固定する。

| 操作 / 失敗                                           | 必須の`errors.Is` |
| ----------------------------------------------------- | ----------------- |
| Configの4 service過不足、host / port不正              | `ErrProtocol`     |
| 8500 bind失敗                                         | `ErrPortInUse`    |
| `Owner.Start`失敗、readiness前のprocess終了           | `ErrProcess`      |
| leader probeの非2xx、不正応答、5秒timeout             | `ErrReadiness`    |
| service registerのHTTP / 非2xx失敗                    | `ErrRegistration` |
| rollback / Close時のderegister失敗、`Owner.Close`失敗 | `ErrCleanup`      |

`Owner.Start`が失敗した場合はprocessを所有していないため`Owner.Close`を呼ばず、
`ErrProcess`だけを返す。Start成功後のreadiness / registration失敗では必ずrollbackと
`Owner.Close`を実行する。cleanup成功なら元のsentinelだけ、cleanupも失敗した場合は
元のsentinelと`ErrCleanup`の両方に`errors.Is`が成立しなければならない。

- 実サービス接続元の環境変数は後続entrypointが所有する。本タスクの自己検証は契約サービスだけを使う。

## スコープ境界

- 本タスク: 契約サービス、WebSocket proxy、専用Consul、通信台帳、production metric service変換、
  自己検証。
- 依存タスク: 外部実行ファイル検査と子プロセス所有者。
- 後続タスク: Frontend操作、WebRTC、実4サービス、Gate判定。
- スコープ外: Pythonサービス変更、production pipeline client変更、codec error、シグナリングHTTP障害、
  metric名・label集合・公開RTC契約の変更。

## 高リスク統合タスクの追加設計

| 所有物         | 作成                   | 正常終了順                                       |
| -------------- | ---------------------- | ------------------------------------------------ |
| 契約サービス   | `pipelinecontract.Set` | 接続close、listener close、worker join           |
| proxy          | `wsproxy.Set`          | 上流・下流接続close、listener close、worker join |
| Consul登録     | `consuldev.Agent`      | 4登録解除                                        |
| Consul process | `consuldev.Agent`      | terminate、`Wait`                                |

`held-close`は旧接続で生成済みの有効responseを配信せず破棄し、generation切替後に対応出力が
観測されないことを全4サービスで確認する。契約サービス内部状態だけで合格にせず、
production `pipeline.Coordinator`へ実registryを`Start`前に`ConfigureRuntime`で渡し、
panic callbackの呼出し回数0、metricと出力台帳を観測する。

固定データの`speech_id`と`sequence_id`をそれぞれ`S`、`Q`とする。契約Extractorは受理した
PCM attempt順に両IDへ0、1、2を加算して、台帳へ割当ててからresponse送信を試みる。
正常turn 1は`S/Q`、障害attemptは`S+1/Q+1`、復旧turnは`S+2/Q+2`である。障害attemptは、
Extractor障害ならExtractor request/result生成まで、Recognizer障害ならRecognizerまで、
Processor障害ならProcessorまで、Synthesizer障害ならSynthesizer request/result生成までの
service prefixだけを台帳に許す。両正常turnは同じpipeline session IDを持つ。
generation 1のProcessor request historyはuser 1件、確定済みresponse historyは
user/assistant各1件の計2件とする。Coordinatorがsession lifetimeで確定履歴を維持する現行契約に合わせ、
generation 2の復旧turnは次の件数とする。障害attemptでProcessor finalまで届かなかったmessageを
assistant履歴として捏造しない。

| 障害service            | 障害attempt後の確定履歴          | 復旧Processor request history | 復旧final history |
| ---------------------- | -------------------------------- | ----------------------------- | ----------------- |
| Extractor / Recognizer | baselineの2件                    | 3件                           | 4件               |
| Processor              | baseline + userの3件             | 4件                           | 5件               |
| Synthesizer            | baseline + user / assistantの4件 | 5件                           | 6件               |

各障害caseで、障害直前の接続数を基準に次の差分を要求する。`accepted`はWebSocket upgrade成功数、
`closed`はproxyが終端を観測した接続数であり、503拒否はどちらにも数えない。再接続完了時の
`active`は全serviceで1、scenario cleanup後は全serviceで0とする。

| 503を返すservice | Extractor accepted/closed | Recognizer accepted/closed | Processor accepted/closed | Synthesizer accepted/closed |
| ---------------- | ------------------------- | -------------------------- | ------------------------- | --------------------------- |
| Extractor        | +1 / +1                   | +1 / +1                    | +1 / +1                   | +1 / +1                     |
| Recognizer       | +2 / +2                   | +1 / +1                    | +1 / +1                   | +1 / +1                     |
| Processor        | +2 / +2                   | +2 / +2                    | +1 / +1                   | +1 / +1                     |
| Synthesizer      | +2 / +2                   | +2 / +2                    | +2 / +2                   | +1 / +1                     |

専用Consulの`GET /v1/health/service/<Name>?passing=true`は各Nameについて、固定ID、
proxyの`127.0.0.1` address、実listen portを持つ1件だけを返し、4固定ID以外の登録は0件とする。

## 実装方針（既存コード整合: file:line）

- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/websocket_integration_test.go:40-142`の
  4サービス固定データとreset試験を再利用可能な契約へ抽出する。
- 同ファイル`:272-277`が既存MessagePack固定データ一覧、`:346-511`が各操作順の根拠である。
- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/coordinator_test.go:88-187`の
  reset single-flight、履歴維持、backoffを外部proxy後の観測点と照合する。
- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/connect.go:80-97`は接続失敗後だけ
  再試行待ちへ入るため、各障害規則へ`RejectReconnects=1`を必須にする。
- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/reset.go:17-114`は障害発生元serviceへ
  `start`と終端結果を各1回記録するため、この2 seriesだけを期待値にする。
- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client/client.go:21-32`のproduction service名と
  `sincromisor-server/sincro-rtc-pion-poc/internal/observability/registry.go:231-235,281-310`の
  metric label語彙が異なるため、後者で4値を明示変換する。
- `sincromisor-server/sincro-rtc-pion-poc/internal/gate3/process/owner.go:50-58,79-121,195-245,268-289`
  の継承なしCommand、`New` / `Start`、contextを取らない`Close`契約を`consuldev.Agent`から使う。
- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client/set.go:93-134`の接続順と
  部分set cleanupを上記接続数行列の根拠にする。
- `sincromisor-server/sincro-rtc-pion-poc/cmd/pion-poc/main.go:131-147`は
  `http://127.0.0.1:8500`を使用するため、自己検証では専用Consulをそこへ起動する。

## テスト

- `go test -race -tags=gate3 ./internal/gate3/pipelinecontract ./internal/gate3/wsproxy ./internal/gate3/consuldev`
  を通し、4サービス×3障害の全12 caseを実行する。
- `go test -race ./internal/pipeline/...`、`go vet -tags=gate3 ./...`、tagなしの`go test ./...`、
  root `npm run gate`、`npm run tasks:check`を通す。
- 未消費規則、arm競合、余分なframe、ID不一致、port競合、process起動失敗、
  readiness timeout、部分登録、旧generation出力、cleanup失敗の各負試験が上表の有限error分類を返し、
  元失敗とcleanup失敗の併発では両sentinelに`errors.Is`が成立することを確認する。

## ソースコードコメント受け入れ条件

新規public API、MessagePack境界、操作台帳、generation、有限規則消費、非同期worker、
接続・processの生存期間と終了順序、metric service変換とその直接helper・固定label集合を
変更理解範囲とする。目的、入力、観測可能な出力、失敗、副作用、非対象、処理の前後関係を説明し、
規約所定の9列で全件点検する。弱い・古いコメントは書き直すか削除し、
TODO必須情報、省略条件、構造改善を確認する。`private`、短さ、型、test、既存無commentを単独の
省略理由にしない。評価担当は全件を照合し、逐語説明、終了・処理の流れの不足、定型的理由があればFAILとする。

## ドキュメント同期の要否

要。`internal/gate3/README.md`へ4契約サービス、注入語彙、規則arm/消費、専用Consul、実サービスを
Gate合格証拠にしない自己検証境界を追記する。
`documents/migration/pion/rollout-and-operations.md:111`の公開metric契約は既に
`extractor|recognizer|processor|synthesizer`を正本としているため本文変更はせず、実装を同期させる。
公開サービス契約とmetric名・label集合は変更しない。

## 文書の言語

説明文と表見出しは一般的な日本語を用い、service名、MessagePack field、package名だけ原表記を残す。
