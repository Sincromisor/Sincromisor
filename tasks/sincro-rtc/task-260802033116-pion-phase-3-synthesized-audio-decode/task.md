# Pion Phase 3の合成音声container decodeを実装する

## 背景 / 目的

Gate 2はVoiceSynthesizerのencoded voiceとmoraをdecodeするが、browserへ送れる固定PCMへ変換していない。
container/codec異常をoutbound pacingから分離し、有限の入力とdeadlineで48 kHz mono PCMへ正規化する。

## 完了条件（受け入れ条件）

- [ ] `internal/media/synthdecode` packageに
      `Decoder.Decode(ctx, protocol.SynthesizerResult) (DecodedSpeech, error)` を実装する。
      `DecodedSpeech` は `SpeechID int64`、`PCM []int16`（48 kHz mono）、
      `Mora []TimedMora` を持つ。`TimedMora` は `Vowel *string`、`Text *string`、
      `StartSample uint64`（inclusive）、`EndSample uint64`（exclusive）とし、入力のnil/empty stringを保持する。
      empty mora queueは有効で、非empty時は0開始・非減少・音声末尾以下とする。
- [ ] `audio/wav`、`audio/aac`、`audio/ogg`、`audio/ogg;codecs=opus` をMIMEのparameter空白・大小を
      正規化して受理し、それ以外はunsupported errorにする。
- [ ] encoded voiceは8 MiB、decode後は48 kHz monoで120秒、decode wall timeは5秒を上限とし、
      空、truncated、malformed、上限超過、timeoutをerrorにして出力queueへ部分結果を渡さない。
- [ ] channelを平均downmixし、入力sample rateから48 kHzへ変換する。
      moraはfloat64秒を先に累積し、各境界で `math.Round(cumulativeSeconds * 48000)` して
      前境界をStart、当該境界をEndとする（個別lengthを丸めてから足さない）。
      負値、NaN/Inf、音声末尾超過を拒否する。`SpeakingTime` はfinite/非負かつ
      decode後sample数との差が960 sample以内を要求し、mora総長は音声以下なら短くても許容する。
- [ ] decoder processのresourceはsuccess/error/cancelの全経路でcloseされ、100回の異常decode後に
      goroutine/fdが増加し続けない。
- [ ] production code comment auditを
      `path/symbol/kind/current comment/reader question/required knowledge/decision/action/reviewer note`
      schemaで記録し、MIME dispatch、上限、container→PCM変換、sample位置の正本と失敗条件を説明する。

## 設計判断（着手前に確定済み）

- 4形式のdemux/decodeはrepository内へcodecを再実装せず、`ffmpeg` subprocessを引数配列で起動して
  s16le/48 kHz/monoをstdoutへ出すadapterに固定する。shellは介さず、stderrは64 KiBで打ち切る。
- MIMEは `mime.ParseMediaType` を使う。media typeとparameter key/valueをcase-insensitive比較し、
  `audio/wav`、`audio/aac`、parameterなし `audio/ogg`、または唯一のparameter
  `codecs=opus` を持つ `audio/ogg` だけを受理する。quoted `opus` はparser正規化後に受理し、
  unknown/duplicate/additional parameterは拒否する。
- `internal/media/synthdecode/decoder.go` に
  `CommandRunner.Run(ctx, executable, stdin, stdoutLimit, stderrLimit, args...) (stdout, stderr []byte, exitCode int, err error)`
  と `NewDecoder(ffmpegPath string, runner CommandRunner) (*Decoder, error)` を置く。
  nil runner/空pathは拒否し、Decoderはimmutableで並行利用可能とする。unit testはfake、
  integration testは実runnerを使う。ffmpeg不在はserver startup errorとしfallbackしない。
- `internal/config.Config` に `FFmpegPath string`、flag `--ffmpeg`（default `ffmpeg`）を追加する。
  `config.Load` が `exec.LookPath` でabsolute pathへ解決し、`cmd/pion-poc.run` がlistener前にversion probeして
  FFmpeg 6.1以上8.x以下を受理する。
  `cmd/pion-poc.run` が実runnerと解決済みpathからDecoderを1つ作り、
  `ManagerDependencies.SynthDecoder *synthdecode.Decoder` へ渡す。Sessionが所有参照を保持し、
  後続outbound taskはそのDecoderを使うだけでconstructor判断を追加しない。
- subprocessにはstdinからencoded voiceを渡し、temporary fileを作らない。shell/子processを起動しないため
  `exec.CommandContext` で直接ffmpegをkillし、Waitを必ずjoinする。
- mora sample offsetはdecode完了時に整数へ確定する。browser decode案はserverがRTP clockを所有できないため採らない。
- errorは `DecodeError{Kind unsupported|invalid|limit|timeout|process, Cause error}` とする。
  入力validation/limitをprocessより先、caller cancelをtimeoutより先、deadlineをnon-zero exitより先に分類し、
  stdout部分結果は全Kindで破棄する。

## スコープ境界

- 本タスク: synthesizer result validation、4 container decode、48 kHz mono化、mora sample mapping。
- 依存タスク: DTO/MessagePack互換とsession lifecycleは変更しない。
- スコープ外: Opus encode/RTP pacing、DataChannel送信、queue policy、Frontend、codec品質比較。

## 実装方針（既存コード整合: file:line）

- `internal/pipeline/protocol/dto.go:142` のSynthesizerResultがencoded voice、MIME、mora、speaking timeを保持する。
- `internal/pipeline/coordinator.go:207` のSynthResultsはgeneration付きencoded resultを公開する。
- `documents/migration/pion/validation-plan.md:89` から `:105` がformat matrixと異常系を定義する。
- `documents/migration/pion/contracts-and-types.md:150` から `:154` はsample positionを同期の正本とする。

## テスト

- privacy確認済みの短い4形式fixtureでduration/sample count/非無音を検証し、生成commandとSHA-256を記録する。
- 各形式の空/truncated/malformed/8 MiB+1/120秒超過/5秒timeout/cancelをtestする。
- mora境界0、empty、末尾一致/960差、負値、NaN/Inf、末尾超過と累積丸めをtestする。
- ffmpeg path不在/version probe失敗がHTTP listener前のstartup errorとなり、fake runnerへabsolute pathが渡ることをtestする。
- `go test -race ./internal/media/...`、`go vet ./...`、`npm run gate`、`npm run tasks:check`を通す。

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

要。`sincromisor-server/sincro-rtc-pion-poc/README.md` にFFmpeg 6.1〜8.xの対応範囲、導入/確認command、
`--ffmpeg`、startup failure、4 MIME形式を同期する。container image/composeへの導入はPhase 4の責務と明記する。
