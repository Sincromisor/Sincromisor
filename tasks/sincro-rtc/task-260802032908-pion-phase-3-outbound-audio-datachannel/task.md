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
      incoming発話は既存発話をevictせず `ErrSpeechQueueFull` で拒否し、その発話のeventもenqueueしない。
      sessionは `output_backpressure` でcloseし、queue/action/countをlog/metricへ出す。
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
- [ ] text/synth output channel close、codec error、track write error、session closeの全経路でencoder、
      ticker、queue、goroutineが1回だけ回収される。
- [ ] change comprehension surfaceのcomment auditを所定schemaで `impl.md` に残し、clock、queue/drop、
      generation barrier、audio/event同期、DataChannel backpressureのreader questionを覆う。

## 設計判断（着手前に確定済み）

- `internal/media/output.go` に `OutputProcessor`、`internal/rtc/data_channel.go` に
  `DataChannelDispatcher` を置き、Sessionは両者を所有する。
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
- generation reset時に再生済み音声は巻き戻さず、未送信分だけ破棄する。in-flightを次generationへ再送しない。

## スコープ境界

- 本タスク: decoded speech queue、Opus encode/pacing、実text/telop dispatch、backpressure、同期。
- 依存タスク: container decodeとmora sample mappingは先行タスクの型を使う。
- スコープ外: signaling/ICE restart、Frontend scheduling、NACK/PLC比較、metrics公開endpoint、音質baseline。

## 実装方針（既存コード整合: file:line）

- `internal/rtc/session.go:117` から `:180` はtest tone encoder/tickerであり置換対象である。
- `internal/rtc/data_channel.go:10` から `:51` は固定payloadを1回送るだけである。
- `internal/pipeline/coordinator.go:202` と `:207` がgeneration付きtext/synth resultを公開する。
- `documents/migration/pion/contracts-and-types.md:156` から `:198` がchannelとbackpressure契約、
  `documents/migration/pion/target-architecture.md:126` から `:138` がoutput責務である。

## テスト

- fake clock/track/encoderで20 ms pacing、sample/timestamp増分、silence、lag、wraparound、発話順を検証する。
- generation reset、queue境界、overflow、audio abort時のmora破棄、channel open前queueを検証する。
- text/telop属性、JSON schema、64 KiB境界、buffered amount high/low/timeout、送信失敗をtestする。
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
buffered amount、silence/pacing、telop同期方針を同期する。既存field/pathは変更しないため
`documents/design/index.md` の新規導線追加は不要。
