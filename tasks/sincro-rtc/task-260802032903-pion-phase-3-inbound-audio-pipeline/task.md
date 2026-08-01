# Pion Phase 3の受信音声をGo pipelineへ接続する

## 背景 / 目的

PoCはOpusを48 kHz stereo PCMへdecodeして統計を取るだけで、Gate 2 Coordinatorが要求する
20 ms / 16 kHz / mono / s16leへ渡していない。RTPの並べ替えとstream resetを含むAudio Input Processorを
独立させ、browser音声を既存Python pipelineへ接続する。

## 完了条件（受け入れ条件）

- [ ] `internal/media/input.go` がRTP sequenceをunwrapし、64 packetのbounded reorder window内を並べ替え、
      duplicateとwindow外late packetをdropする。16-bit sequence/timestamp wraparoundは正常継続する。
- [ ] SSRC変更でreorder/decoder/resampler stateを破棄し、新streamの最初のpacketから再開する。
- [ ] Opusを48 kHzへdecodeし、stereoは左右平均、monoはそのまま、pure Goの固定48→16 kHz
      63-tap windowed-sinc FIRで16 kHz monoへ変換し、20 msごとの640-byte s16leを
      `Coordinator.SubmitPCM`へ渡す。端数は次packetへ保持する。
- [ ] pipeline reset中の `ErrPipelineUnavailable` は入力frameを保存せずdrop countへ加算し、
      その他のSubmit errorとmalformed non-empty Opusはsession closeへ通知する。DTX空payloadは無視する。
- [ ] RTP reader終了、decoder error、context cancel、SSRC変更の各経路でgoroutineとbufferが回収される。
- [ ] telemetryは `duplicate`、`late`、`missing`、`buffered_drop`、`dtx`、
      `pipeline_unavailable` を別eventとしてobserverへ渡す。Coordinator自身のinput queue overflowは
      Coordinatorの既存counterの責務とし、InputProcessor側へ重複計上しない。
- [ ] change comprehension surfaceのcomment auditを
      `path/symbol/kind/current comment/reader question/required knowledge/decision/action/reviewer note`
      schemaで `impl.md` に残し、RTP ordering、変換段階、drop policy、後段契約をreader-oriented commentにする。

## 設計判断（着手前に確定済み）

- `internal/media/input.go` に `InputProcessor` を置き、RTC Sessionは
  `Run(ctx, RTPReader, SubmitFunc) error` だけへ依存する。
- `internal/media/input_metrics.go` に
  `InputEvent` enum（`duplicate|late|missing|buffered_drop|dtx|pipeline_unavailable`）と
  `InputObserver{ObserveInputEvent(InputEvent)}` interfaceを置く。
  `NewInputProcessor(observer InputObserver)` はnilを拒否してfieldへ保持し、`Run` が各eventごとに同期的に
  1回通知する。methodは値を返さず通知failureという別経路を作らない。
  `internal/rtc.SessionDependencies` がprocess-shared observerを受け、Sessionがconstructorへ渡す。
  production初期実装はatomic counterを持つ `NewInputCounterObserver()`、testはrecording observerを使う。
  observer panicはmedia goroutine errorとしてsession closeへ合流する。
- 最初のpacketのsequenceを `next` とする。windowは `[next,next+63]` を含み、
  `next+64` は範囲外として、入るまで欠番をmissing確定して連続packetを送出する。
  EOFとSSRC変更では `next` からの連続prefixだけを送出し、gap以後を `buffered_drop` として全dropする。
  context cancelではdecode/submitせずbufferを全dropする。
- InputProcessor内には別queueを置かず、並べ替え後に同期的にSubmitFuncを呼ぶ。
  backpressure/dropは `Coordinator.SubmitPCM` の25 frame queue契約へ一本化する。
- resamplerは新規native依存を増やさず、`internal/media/resample.go` に固定係数のstreaming FIRとして置く。
  線形補間/単純間引きはaliasingをGate 3へ持ち越すため採らない。
- FIRは63 tap、Kaiser window beta=5.0、cutoff 7.2 kHz、DC gain 1.0へ正規化した対称係数を
  1e-12で丸めたliteral tableとしてsourceを正本にする。stream先頭は31 sampleのzero history、
  入力index `n % 3 == 2` で出力し、EOFでzero paddingせず端数をdropする。
  float64積和を `math.Round` 後int16範囲へclampする。
- pipeline unavailable中は再送しない。Coordinatorのgeneration semanticsをInput Processorへ複製しない。

## スコープ境界

- 本タスク: inbound RTP ordering、Opus decode、downmix/resample/frame化、SubmitPCM接続。
- 依存タスク: session readiness後のCoordinator ownershipは前タスクが提供する。
- スコープ外: NACK/PLCの採用比較、outbound audio、synthesizer container、DataChannel、signaling、Firefox/NAT。

## 実装方針（既存コード整合: file:line）

- `internal/media/audio.go:127` のDecodeRemoteは到着順decodeのみでresample/reorderを後続へ委ねる。
- `internal/rtc/session.go:192` のOnTrackがaudio/Opusを検証し、`:204` からdecode goroutineを開始する。
- `internal/pipeline/coordinator.go:174` のSubmitPCMは640-byteだけを受理し、満杯時は古いframeをdropする。
- `documents/migration/pion/target-architecture.md:89` から `:96` が入力processorの正本である。

## テスト

- golden waveformで48 kHz mono/stereo→16 kHz monoの出力数が `floor(input/3)`、20 msが320 sample、
  1 kHz toneの周波数誤差5 Hz以下・passband振幅誤差0.5 dB以下、10 kHz toneのalias減衰30 dB以上、
  stereo左右反相がzeroになることを検証する。係数tableのSHA-256も固定する。
- reorder、duplicate、late、loss、sequence/timestamp wrap、SSRC変更、DTX、malformed Opusをtable testする。
- fake Coordinatorでrunning/reset/closed時のsubmit、drop、close通知を検証する。
- recording observerで各duplicate/late/missing/buffered drop/DTX/unavailable入力1件が対応event1件、
  通常packetとCoordinator overflowがevent0件になることを確認する。
- `go test -race ./internal/media ./internal/rtc ./internal/pipeline`、`go vet ./...`、
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

不要。既存audio trackおよびAudio Pipeline WebSocket契約どおりに内部変換し、公開schemaを変えないため。
