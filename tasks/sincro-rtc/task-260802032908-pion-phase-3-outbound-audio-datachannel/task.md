# Pion Phase 3の合成音声とDataChannel出力を統合する

## 背景 / 目的

PoCの1秒test toneと固定DataChannel JSONを、Gate 2 pipelineの実出力へ置き換える。
browser入力のcadenceに依存しない20 ms outbound clockを正本にし、合成音声とmora/telopを同じsample位置で送る。

## 完了条件（受け入れ条件）

- [ ] `internal/media/output.go` が48 kHz mono PCMを20 ms / 960 sampleへ分割してOpus encodeし、
      session所有の絶対deadline clockでPion trackへ送る。入力停止中もclockは動き、queue空時は
      silence frameを送る。
- [ ] synthesized speechは発話順を維持するbounded queue（8発話かつ合計120秒以下）へ入り、
      pipeline generation変更時は旧generationの未送信audioとeventを破棄する。いずれかの上限へ達した
      のではなく、追加後に8発話または120秒を超えるincoming発話だけを、既存発話をevictせず
      `ErrSpeechQueueFull` で拒否する（8発話ちょうど、合計120秒ちょうどは受理する）。
      拒否した発話のeventもenqueueしない。
      sessionは `output_backpressure` でcloseし、queue/action/countをlog/metricへ出す。
- [ ] `pipeline.Coordinator` はstableなgeneration変更streamを公開する。初回running generationと
      resetでadvanceしたgenerationを通知し、reset時はoutput publishと同じbarrier内でgeneration advance、
      buffered `TextResults` / `SynthResults` drain、generation通知を順に確定する。通知queueは最新値へ
      coalesceできるが単調増加を保ち、Coordinatorだけが全producer join後にcloseする。
      consumerはgeneration通知と各`Output.Generation`の両方をbarrierとして扱い、より新しいgenerationを
      観測した時点で取り込み済みの旧audio/text/telopを直ちにpurgeする。次generationのoutputが1件も来ない
      resetでもgeneration通知だけでpurgeを完了する。
- [ ] scheduler lag時に期限切れsilenceをburst送信せずdropする。発話frameのlagが250 msを超えた場合は
      その発話の残audio/moraを中止してmetric/logへ記録し、次発話を実時間隔で再開する。
- [ ] `internal/rtc/data_channel.go` のsmoke payloadをdispatcherへ置換する。`text_ch` は64件FIFO、
      `telop_ch` は128件で古い未送信eventをdropし、各payloadはUTF-8 JSON textかつ64 KiB以下に制限する。
      text queue満杯はincomingを `ErrTextQueueFull` で拒否してsession close、telop満杯は最古1件と
      そのeventだけをdropしてsession継続とし、どちらもqueue/action/countをlog/metricへ出す。
- [ ] `bufferedAmount` が1 MiB以上なら送信を抑制し、256 KiB以下への復帰を最大5秒待つ。
      timeout、reliable text送信失敗、channel closeはsession error、unreliable telop単発dropはsession継続とする。
- [ ] mora/telop eventは整数sample offsetのtickで対応audio frameを書き込む直前に送る。
      audioを中止/dropした場合は対応する未送信eventも後送しない。
- [ ] telopは送信する各発話audio frameにつき、そのframe開始sampleを含むmoraがあれば1件生成する。
      `timestamp` は発話開始からのframe開始sample / 48000秒、`length` は
      `(EndSample-StartSample)/48000`秒、`message` はdecode前の同じ`SynthesizerResult.Message`を
      speech queue itemに保持して使う。`vowel` / `text` のnilはwire上のempty stringへ変換し、
      非nil empty stringもemptyのまま保つ。`new_text` はそのmoraを送る最初のframeだけtrue、
      後続frameはfalseとする。mora境界がframe内にある場合は次のframe開始から新moraへ切り替え、
      active moraがないframeではtelopを送らずaudioだけを送る。
- [ ] text/synth output channel close、codec error、track write error、session closeの全経路でencoder、
      ticker、queue、goroutineが1回だけ回収される。
- [ ] 既存のSession lifecycle契約を維持する。outbound trackはAnswer生成前に登録し、RTCP drainと
      `OutputProcessor`のclock/consumer goroutineはtransport connected時にだけ開始する。
      起動権とWaitGroup予約は`sessionLifecycle.mu`内で一度だけ確定し、重複connected callbackで再開しない。
      text/telop channelは属性検証、同label object identity登録、OnOpen identity確認を通過した同じobjectだけを
      dispatcherへ渡し、audioを含むreadiness latchとpipeline遅延開始を迂回しない。
      Closeはcontext cancel、所有resource close、全goroutine join後にだけclosed/registry removeを公開する。
- [ ] change comprehension surfaceのcomment auditを所定schemaで `impl.md` に残し、clock、queue/drop、
      generation barrier、audio/event同期、DataChannel backpressureのreader questionを覆う。

## 設計判断（着手前に確定済み）

- `internal/media/output.go` に `OutputProcessor`、`internal/rtc/data_channel.go` に
  `DataChannelDispatcher` を置き、Sessionは両者を所有する。
- `installOutboundTrack`によるpre-Answer track登録と、`transportReady`によるconnected後の
  RTCP drain/outbound開始を維持する。`transportReady`はlifecycle mutex内でWaitGroupを予約し、
  lock外でgoroutineを開始する。OutputProcessorは有限test toneを置換するが、gather timeout中に
  outbound goroutineを持たない契約は変更しない。
- DataChannel dispatcherは`handleDataChannel`の属性検証と`registerDataChannel`を置換しない。
  `OnOpen`で`dataChannelOpened`がobject identityを確認して送信権を返した後にだけ、登録済みchannelを
  dispatcherへ接続する。readiness latchはtransport、audio、text open、telop openのANDを正本とし、
  Coordinatorの遅延開始をdispatcherから直接開始しない。
- Coordinatorに `GenerationChanges() <-chan uint64` を追加する。初回接続成功とreset advanceを
  `outputMu`でtext/synth publishと直列化し、resetでは旧output drain後・barrier解放前に次generationを
  non-blockingで通知する。capacity 1で未読の古いgenerationを最新値へ置換してよい。
  `Close`は全producer join後にtext/synth/generation channelを同じoutput barrier内でcloseする。
  OutputProcessor/dispatcherはgeneration通知を共有し、output envelope側で先に新generationを観測した場合も
  同じpurge処理を行う。これにより異なるchannel間のselect順序へ正しさを依存させない。
- clockの正本は48 kHz sample positionとし、wall clockはpacing deadlineにだけ使う。
  float秒をtickごとに再計算しない。
- queue空時は20 ms silenceを送る。送信休止案はbrowser側jitter bufferとRTP clockの再始動を複雑にするため採らない。
- `internal/rtc/data_channel_payload.go` にDataChannel専用 `chatMessagePayload` を置き、
  `speech_id int64`、`message_id string`、`message_type string`、`speaker_id string`、
  `speaker_name string`、`expression_code *int64`（`omitempty`でnilはfield欠落、zeroは保持）、
  `message string`、`created_at float64` のJSON tag付きschemaへ明示変換する。
  pipeline DTOへJSON tagは追加しない。
- telop payloadは既存Frontend schemaの
  `{speech_id,timestamp,message,vowel,text,length,new_text}` を生成し、application fieldを増やさない。
- decode前の`SynthesizerResult.Message`とdecode後の`DecodedSpeech`を1つのimmutable queue itemへまとめる。
  telopは20 ms audio frameごとにframe開始sampleでactive moraを選び、同じframeのtrack write直前に送る。
  nilのvowel/textはFrontend required stringとの境界でempty stringへ変換する。
- generation reset時に再生済み音声は巻き戻さず、未送信分だけ破棄する。in-flightを次generationへ再送しない。

## スコープ境界

- 本タスク: decoded speech queue、Opus encode/pacing、実text/telop dispatch、backpressure、同期。
- 依存タスク: container decodeとmora sample mappingは先行タスクの型を使う。
- スコープ外: signaling/ICE restart、Frontend scheduling、NACK/PLC比較、metrics公開endpoint、音質baseline。

## 実装方針（既存コード整合: file:line）

- `internal/rtc/media.go:18` から `:89` はpre-Answer outbound track、connected後のRTCP drain、
  有限test tone encoder/tickerである。track/RTCP lifecycleを維持して`startTone`だけを
  process-wide Decoderとpipeline outputを使う継続clockへ置換する。
- `internal/rtc/readiness.go:38` から `:85` はtransport connectedの一回限りの起動権、
  lifecycle mutex内のWaitGroup予約、lock外のgoroutine開始を所有する。
- `internal/rtc/data_channel.go:15` から `:58` と `internal/rtc/readiness.go:116` から `:187` は
  channel属性、同label object identity、OnOpen、media readinessを直列化する。
  固定payloadだけをdispatcher接続へ置換し、検証・latch・遅延pipeline開始は維持する。
- `internal/rtc/session.go:30` から `:77` と `:165` から `:225` はSession所有権、
  非所有SynthDecoder、close-once、resource close、WaitGroup join、registry公開順序の正本である。
- `internal/pipeline/coordinator.go:202` から `:210` がgeneration付きtext/synth resultを公開する。
- `documents/migration/pion/contracts-and-types.md:157` から `:199` がchannelとbackpressure契約、
  `documents/migration/pion/target-architecture.md:126` から `:138` がoutput責務である。

## テスト

- fake clock/track/encoderで20 ms pacing、sample/timestamp増分、silence、lag、wraparound、発話順を検証する。
- generation reset、queue境界、overflow、audio abort時のmora破棄、channel open前queueを検証する。
- generationについて、旧発話をconsumer queueへ取り込んだ後、次generationのtext/synth outputが
  1件も来ないreset通知だけで旧audio/eventが直ちにpurgeされるraceを検証する。
- speech queueは発話件数とPCM sample合計のそれぞれでlimit-1 / limit / limit+1を検証し、
  8発話と120秒ちょうどを受理、超過incomingだけを`ErrSpeechQueueFull`にする。
- text/telop属性、JSON schema、64 KiB境界、buffered amount high/low/timeout、送信失敗をtestする。
- telop共有fixtureで、nil/emptyのwire変換、元message保持、frame sampleからのtimestamp、
  mora sample幅からのlength、各20 ms frameの送信、mora最初だけのnew_text、frame内境界を次frameで
  切り替える規則、active moraなしでは送らない規則を固定する。
- connected前/gather timeoutではoutbound goroutineが始まらず、重複connectedで二重開始せず、
  transport callback内で予約したgoroutineをCloseがjoinすることをtestする。
- channel属性違反、別objectの同label、未登録/置換済み/重複OnOpenはdispatcherへ到達せず、
  正しい2 channelとaudioが揃うまでpipelineを開始しないことをtestする。
- `expression_code` のnil欠落/zero保持と全snake_case fieldを共有JSON fixtureで検証し、
  Opus trackのstereo SDP capability上でもmono入力encode/playbackが成立することをlocal pairで確認する。
- browser入力を停止したlocal Pion pairでもqueued音声50 frameが20 ms間隔で送られるintegration testを行う。
- `go test -race ./internal/media/... ./internal/rtc ./internal/pipeline`、`go vet ./...`、
  `npm run gate`、`npm run tasks:check`を通す。

## ソースコードコメント受け入れ条件

- 変更production codeと、その理解に必要な直接のhelper/state/event/lifecycle/data transformationを
  change comprehension surfaceとして全件auditする。`impl.md` は `path`、`symbol/block/decision/flow`、
  `kind`、`current comment`、`reader question`、`required reader knowledge`、`decision
(keep/rewrite/delete/add)`、`action/omission reason`、`reviewer note` の列を持つ。
- exported/public APIとboundaryは目的、入力境界、戻り値/observable output、失敗条件、副作用、非対象を
  必要に応じて説明する。内部orchestration/pipeline/state transition/event source/data transformationは、
  処理段階、data表現、state change、前後関係、後段へ委ねる責務を局所的に理解できる説明にする。
- 弱い/stale commentはrewrite/deleteし、新規file/symbolは現行規約を満たす。省略は
  `documents/rules/source-comments.md` の具体的条件をauditに書き、private、短い、型がある、testを読める、
  既存も無commentを単独理由にしない。TODOは理由、削除条件、canonical task ID、期限/判断基準を必須とする。
  コメント前に命名/関数分割/型/options object/module境界を検討するが、構造改善を説明省略理由にしない。
- evaluatorは変更対象とsurfaceを全件照合し、未照合範囲と残リスクを `eval.md` に書く。
  逐語説明、確認先だけ、失敗modeのないheuristic説明、内部flowの理解不能、stale comment、
  定型的な省略理由が1件でもあればFAILとする。

## ドキュメント同期の要否

要。公開挙動の実装値として `documents/design/contracts/frontend-rtc.md` のDataChannel payload上限、
buffered amount、silence/pacing、telopのnil/empty変換・message・timestamp・length・per-frame cadence・
new_text同期方針を同期する。既存field/pathは変更しないため
`documents/design/index.md` の新規導線追加は不要。
