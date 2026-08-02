# Implementation Log: task-260802033116-pion-phase-3-synthesized-audio-decode

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 結果

- 実装worktree: `/tmp/eval-98146566b865-1RH6a5`
- branch: `codex/task-260802033116-pion-phase-3-synthesized-audio-decode`
- final HEAD: `9f1cf03fdd20b7ace14b01420c167cb7ab72fe71`
- 実装commit:
    - `3f51e86cb15517967a81f4b4e2fcf34cd14ec84b` — decoder、FFmpeg startup、注入経路、test/fixture、README同期
    - `9f1cf03fdd20b7ace14b01420c167cb7ab72fe71` — comment auditで確認したobservable error/data transformation説明の補完

### 判断とレビュー申し送りへの対応

- `CommandRunner`はtask記載の具体型をそのまま採用し、production `ExecRunner`とfake runnerで同じ契約を検証した。`ExecRunner`はshellやtemporary fileを介さず、`exec.CommandContext`へencoded voiceをstdinで渡す。stdout/stderrはprocessをblockさせず全量を読み捨てながら、各上限の1 byte先までだけ保持する。`Run`は`command.Run`のreturnまで待つため、cancel/errorでもprocessをjoinしてから返る。
- MIMEは`mime.ParseMediaType`を正本にした。parserが大小違いの重複parameter keyをmapへ畳むため、quoted value内のsemicolonを区別する小さな事前scanだけを追加し、duplicate/additional/unknown parameterをFFmpegの自動推測へ流さない。
- FFmpegにはdemuxerをMIMEから明示し、`-ac 1 -ar 48000 -f s16le`でchannel平均downmixとresampleを同じprocess段で完了させる。PCMは完全decode後にのみ`[]int16`へ変換し、process failure、cancel、timeout、limit、timing不整合の全経路でzero-value resultを返す。
- moraは個別lengthを丸めず、`float64`秒を順に累積して各境界で`math.Round(cumulativeSeconds * 48000)`した。nil/empty pointer値をコピーせず保持し、empty queue、zero length、音声より短い総長を許容した。
- `config.Load`が`--ffmpeg`を`exec.LookPath`と`filepath.Abs`で起動時に確定し、`cmd/pion-poc.run`がlistener/Manager作成前に6.1〜8.xをprobeする。fallbackは追加していない。
- review.md申し送りどおり、単一`*synthdecode.Decoder`を`ManagerConfig -> sessionBuildRequest -> newSession -> Session`へ同じpointerのまま渡した。`NewManager`と`newSession`はnilをresource作成前に拒否する。DecoderはimmutableでCloseを持たず、`sessionResourceClosers`の3所有resourceへ追加していない。一方のSession close後も他方の参照が同一であるtestを追加した。
- DTO、MessagePack、Coordinator channel、Session cleanupの3-resource ownership、outbound pacingは変更していない。

### 仕様からの逸脱

- なし。

### 詰まりと回避

- sandbox内では既存RTC/signaling integration testがloopback socket作成時に`operation not permitted`となった。実装失敗ではないことをfocused compileで確認後、同一commandをsandbox外で実行し、通常testと全module raceの両方がPASSした。
- worktreeのGit metadataはmain checkout配下のread-only `.git/worktrees`にあるため、stage/commit/commit checkは許可済みのsandbox外実行を使った。対象pathを列挙し、無関係な差分はstageしていない。

### Fixture

- privacy: FFmpeg `lavfi`の440 Hz sineから生成しており、実音声・個人情報・第三者素材を含まない。
- 生成commandと更新条件は`internal/media/synthdecode/testdata/README.md`へ記録した。
- SHA-256:
    - `tone.wav`: `7086bc9426e9814b431061c9d9652752141f7ecb37a128f90f79adee892bd975`
    - `tone.aac`: `7af6d11cbb2cb49d6b9794e7df9e438345bed102ac399f3a68fa8158e2a31495`
    - `tone.ogg`: `c91da395de64d60b1336da9954b65088b4ec9cfd69211f3bf68e37b390ed0b`
    - `tone-opus.ogg`: `a638233d7810abd155a18a1bb75ae7a7e8f30a04627f742f2f6f6653b73f0c2c`

### Verification

- `go test ./... -count=1`: PASS（loopback socketを許可したsandbox外実行）
- `go test -race ./internal/media/... -count=1`: PASS
- `go test -race ./... -count=1`: PASS（最終SHA、loopback socketを許可したsandbox外実行）
- `go vet ./...`: PASS
- `go mod tidy -diff`: PASS、差分なし
- `npm run tasks:check`: PASS（273 tasks）
- `npm run tasks:index:check`: PASS（13 categories、変更なし）
- Markdown Prettier check: PASS
- `npm run commit:check`: PASS（最終SHA）
- `npm run gate`: PASS（最終SHA `9f1cf03`; lint / build / test、frontend 85 passed + 1 skipped、577 tests passed + 2 skipped）

### ドキュメント同期

- `sincromisor-server/sincro-rtc-pion-poc/README.md`へFFmpeg 6.1〜8.x、導入/version確認、`--ffmpeg`、listener前startup failure、4 MIME形式を同期した。
- container image/production composeへのFFmpeg導入はtask指定どおりPhase 4責務と明記した。
- fixtureの生成command、privacy根拠、SHA-256は`internal/media/synthdecode/testdata/README.md`へ同期した。
- 公開通信契約、DTO、生成barrel/配布物は変更していないため、OpenAPI/MessagePack fixture/生成物の同期は不要。

### Comment audit

| path                                               | symbol / block / decision / flow                                             | kind                                  | current comment                                                      | reader question                                                         | required reader knowledge                                                                                                                | decision             | action / omission reason                                                                                                                                                                                   | reviewer note                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `internal/media/synthdecode/doc.go`                | package `synthdecode`                                                        | navigation / ownership                | 新規packageで既存commentなし                                         | pipeline全体のどこを担当し、何を担当しないか                            | container入力から検証済みPCM/moraまでを担当し、RTP frame/pacingは後段。Decoderはprocess-wide非所有                                       | add                  | package commentへ入力、出力、失敗時の完全破棄、隣接責務、immutable ownershipを追加                                                                                                                         | outbound実装をこのpackageへ混ぜない境界を照合                            |
| `internal/media/synthdecode/runner.go`             | `CommandRunner` / `ExecRunner.Run`                                           | process boundary / lifecycle          | 新規symbolで既存commentなし                                          | cancel/大量出力時にprocess、pipe、Waitは誰が回収するか                  | shellなし、stdin渡し、limit+1保持、全出力消費、ctx kill、return前join                                                                    | add                  | interfaceとproduction methodへ入出力、上限超過観測、exit code、cancel/join、不保持resourceをdoc comment化                                                                                                  | success/error/cancelで`Run`がjoin後returnすることをtestと照合            |
| `internal/media/synthdecode/runner.go`             | `limitedBuffer.Write` flow                                                   | constraint / lifecycle                | 新規private blockで既存commentなし                                   | 上限後にWriteをerrorにするとchildがblockしないか                        | 上限後も全byteを受理し、memoryはlimit+1へ固定する必要がある                                                                              | add                  | struct commentへpipeを詰まらせない理由と超過1 byteの意味を追加。`newLimitedBuffer`/`Bytes`はこのinvariantを変更せず局所的な構築・参照だけなので個別commentを省略                                           | Writeが常に入力lenを返し、保持sizeだけ制限することを照合                 |
| `internal/media/synthdecode/decoder.go`            | `ErrorKind` / `DecodeError` / `Error` / `Unwrap`                             | API / error contract                  | 新規symbolで既存commentなし                                          | callerは何で分岐し、診断へpayloadが漏れないか                           | 5 kindは安定分類、Causeは`errors.Is/As`対象、error文字列にvoiceを含めない                                                                | add                  | type/const/field/methodへ分類、Cause、observable文字列、payload非露出を追加                                                                                                                                | unsupported/invalid/limit/timeout/processの全kindとcancel causeを照合    |
| `internal/media/synthdecode/decoder.go`            | `TimedMora` / `DecodedSpeech`                                                | API / data contract                   | 新規symbolで既存commentなし                                          | sample単位、区間端、nil/empty、partial resultの意味は何か               | 48 kHz、inclusive/exclusive、nil/empty保持、PCM 1要素=1 sample、失敗時zero value                                                         | add                  | typeと各単位依存fieldへdoc commentを追加                                                                                                                                                                   | public field型だけでは読めない単位とzero/empty意味を照合                 |
| `internal/media/synthdecode/decoder.go`            | `Decoder` / `NewDecoder`                                                     | API / ownership                       | 新規symbolで既存commentなし                                          | 並行共有できるか、Closeは必要か、constructorは何を検証するか            | immutable、process/goroutine非保持、空path/nil runner拒否、path探索/version probeはcaller責務                                            | add                  | ownership、並行利用、非対象、validationをdoc comment化                                                                                                                                                     | Session closerへ入っていないことと照合                                   |
| `internal/media/synthdecode/decoder.go`            | `ProbeVersion`                                                               | process boundary / version constraint | 新規symbolで既存commentなし                                          | どのversionをいつ検証し、失敗時fallbackするか                           | listener前、6.1〜8.x、起動/parse/範囲外をerror、fallbackなし                                                                             | add                  | startup contractとfailure modeをdoc comment化                                                                                                                                                              | stdout/stderr有限化とversion両端testを照合                               |
| `internal/media/synthdecode/decoder.go`            | `Decode` orchestration                                                       | flow / boundary / constraint          | 新規symbolで既存commentなし                                          | validation、process、PCM/timing変換はどの順で、失敗時何を返すか         | process前validation、5秒、8 MiB/120秒、caller cancel優先、stdout部分破棄、timing検証後だけreturn                                         | add                  | exported docとFFmpeg変換blockへ処理段階、前後関係、後段へ渡す条件を追加                                                                                                                                    | 入力validationがfake runner call前、全errorがzero resultであることを照合 |
| `internal/media/synthdecode/decoder.go`            | `parseAudioFormat` / duplicate parameter decision                            | parser / compatibility                | 新規private boundaryで既存commentなし                                | parser正規化後に何を受理し、自動推測へ何を流さないか                    | case-insensitive MIME、Oggの唯一`codecs=opus`、unknown/additional/duplicate拒否、quoted semicolon                                        | add                  | MIME matrixと事前duplicate scanの必要理由を各helperへ追加                                                                                                                                                  | exact/case/quoted/duplicate/additional test matrixと照合                 |
| `internal/media/synthdecode/decoder.go`            | input/output limit constants / `validateInputTiming`                         | heuristic / constraint                | 新規decisionで既存commentなし                                        | どの上限をprocess前後のどこで適用し、誤調整時に何が起きるか             | 8 MiB/120秒/5秒/64 KiB/960 sample。process前validationとstdout limit+1の役割が異なる                                                     | add                  | `Decode`、`validateInputTiming`、`validateSpeakingTime`近接commentへ値、段階、failure modeを記録。定数の逐語commentは近接説明とdomain名で重複するため省略                                                  | task固定値とargs/runner limit/test境界値を照合                           |
| `internal/media/synthdecode/decoder.go`            | `mapMora`                                                                    | data transformation / rounding        | 新規private flowで既存commentなし                                    | 個別丸めか累積丸めか、短いqueue/zero length/末尾超過はどう扱うか        | float64秒を先に累積、各境界でRound、前境界Start、非減少、音声より短くてよい                                                              | add                  | 変換の正本、許容条件、失敗条件を近接comment化                                                                                                                                                              | 0.000011秒×2の累積丸め、nil/empty、zero、末尾testと照合                  |
| `internal/media/synthdecode/decoder.go`            | `decodePCM` / `isFiniteNonNegative` / `decodeError`                          | data / pure helper                    | 新規private helperで既存commentなし                                  | byte列のendian/formatはどこで確定したか。単純helperに非局所契約があるか | `decodePCM`はFFmpeg確定済みs16leの表現変換のみ。残る2 helperは副作用/ownership/順序/domain表現を追加せず名前・引数・単一式で局所判断可能 | add / omission       | `decodePCM`へ前段との関係とlittle-endian変換を追加。`isFiniteNonNegative`と`decodeError`は上位flowの位置、入出力、失敗/副作用なしを呼出名と単一式から誤解なく判断でき、§4全項目を満たすため個別comment省略 | private/短いこと単独ではなく、非局所knowledgeがないことを照合            |
| `internal/config/config.go`                        | `Config.FFmpegPath` / `Load` FFmpeg resolution                               | API / startup boundary                | Config/Load commentはHTTP/static/ICEだけを説明しておりFFmpegは未記載 | 下流へ渡るpathは探索済みか、versionはどこで見るか                       | `exec.LookPath`+absolute化はLoad、version probeはmain、missing pathはlistener前error                                                     | rewrite / add        | Config/Load commentをrewriteし、fieldへabsolute executable invariantを追加                                                                                                                                 | custom/default/missing path testと照合                                   |
| `cmd/pion-poc/main.go`                             | `run -> newSynthDecoder -> NewManager` startup flow                          | orchestration / lifecycle             | `run` commentはHTTP/shutdownのみでFFmpeg前提なし                     | listenerより先にどこでprobeし、Decoderは何個作られるか                  | config後に1個作成/probeし、同じpointerをManagerへ渡す。失敗はpartial startupにしない                                                     | add                  | `newSynthDecoder`へ処理位置、failure effect、test seam理由を追加し、runのprobe call直後にManager注入                                                                                                       | `serve`より前であることとstartup fake testを照合                         |
| `internal/rtc/manager.go`                          | `ManagerConfig -> sessionBuildRequest -> buildSession -> Create`             | orchestration / ownership             | 既存commentはfactory/observer/ClockとSession所有resourceだけを説明   | Decoder pointerはどの段でcopy/生成/closeされるか                        | process-wide同一pointerをrequestへ渡し、Sessionへ非所有移譲せず参照。NewManager nilはresource前拒否                                      | rewrite / add        | ManagerConfig/Manager/sessionBuildRequest commentをrewrite、fieldを追加、Create requestへ同じpointer設定                                                                                                   | pointer identity testとnil dependency testを照合                         |
| `internal/rtc/session.go`                          | `Session.synthDecoder` / `newSession` / `sessionResourceClosers` / `cleanup` | lifecycle / ownership                 | 既存commentはPeerConnection/codec/Coordinatorの3所有resourceを説明   | Session closeでDecoderも閉じるか、他Sessionへの影響はあるか             | Decoderは非所有・Closeなし。closer数3とcleanup channel capacity 3を維持する                                                              | keep / rewrite / add | 既存3-resource closer/cleanup commentは正確なのでkeep。Session fieldとnewSession commentへ非所有理由を追加し、nil checkをInputProcessor/PeerConnection前に配置                                             | closerへDecoderが無いこと、片Session close後のpointer identityを照合     |
| `sincromisor-server/sincro-rtc-pion-poc/README.md` | FFmpeg runtime documentation                                                 | docs synchronization                  | FFmpeg要件、flag、MIME matrixの記載なし                              | 利用者が対応version、導入、failure、Phase 4境界をどう知るか             | 6.1〜8.x、`--ffmpeg`、startup failure、4 MIME、compose導入はPhase 4                                                                      | add                  | Build requirements/local command/PoC boundariesへ同期                                                                                                                                                      | 実装のdefault/range/MIMEと文書が一致することを照合                       |

### 残リスク

- production container image/composeにはまだFFmpegを導入していない。これは仕様どおりPhase 4で同期が必要。
- FFmpeg codec実装差は対応version範囲内でもsample padding差を持つため、fixtureは形式ごとの実decode sample数を固定し、`SpeakingTime`との差は20 ms（960 sample）だけ許容している。

### 記録訂正

- 上記結果とVerificationに記載したfinal HEAD `9f1cf03`の完全なSHAは
  `9f1cf0306f8759e6e5fe581f82217f27083e7851`。
- 上記Fixture欄の`tone.ogg` SHA-256は
  `c91da395de64d60b1336da9954b65088b4ec9c9fcd69211f3bf68e37b390ed0b`。
  append-only方針に従い、誤記行を編集せず訂正を追記した。

## attempt 2

### 結果

- 評価attempt 1のFAIL残課題をすべて解消した。
- final HEAD: `a3b216a5166c926005ffd5aabdd57b418ecebc54`
- commit: `a3b216a5166c926005ffd5aabdd57b418ecebc54` — format別異常matrix、real PCM golden/process lifecycle、注入/startup orchestrationの受け入れ境界を固定。

### eval.md残課題への対応

1. 算術平均downmixとreal decode/mora:
    - 48 kHz stereo s16le WAVをtest内で決定的に生成し、左1000・右3000の全480 sampleがmono 2000になることをreal FFmpegでgolden検証した。
    - 同じ結果でmoraが`0..192`、`192..480`へmappingされ、producerのpointer値を保持することを確認した。
    - 既存44.1 kHz fixtureの48 kHz sample数検証と合わせ、downmixとresampleの両段を固定した。
2. 4形式の異常matrix:
    - WAV、AAC、Ogg Vorbis、Ogg Opusそれぞれについてempty、8 MiB+1、120秒超過、5秒timeout、caller cancelをtable-driven unit testへ追加した。
    - 各caseで`DecodeError.Kind`とzero-value `DecodedSpeech`をassertした。
    - 同4形式のreal fixtureを1 byteへtruncatedした入力とmalformed入力をFFmpegへ通し、`process` kindとzero resultをtable-driven integration testで固定した。
3. real subprocess lifecycle:
    - test binary自身をhelper subprocessとして起動し、実行開始後のcancelとdeadline timeoutで`ExecRunner.Run`が返ることを検証した。
    - markerに記録したPIDへreturn後`kill(pid, 0)`を行い、`ESRCH`でprocess終了とWaitによるreapを確認した。
    - success、exit 7 error、実行中cancelを各20回繰り返し、goroutine/fdが増加し続けないことを固定した。既存の100回malformed FFmpeg testも維持した。
4. Decoder注入と非所有closer:
    - Managerのbuilder seamで`sessionBuildRequest.synthDecoder`を捕捉し、実PeerConnectionを持つ2 Sessionを`Manager.Create`経由で作った。
    - `ManagerConfig -> sessionBuildRequest -> newSession -> Session`の全pointerが同一であることをassertした。
    - 一方のSessionの3 closerをwrapper計数し、cleanupがPeerConnection/codec/Coordinatorのexactly 3件だけを呼ぶこと、他方のDecoder参照が不変であることを確認した。
5. listener前startup failure:
    - `run`のstartup orchestrationへ`CommandRunner`と最終`serveBoundary`を注入できるprivate seamを抽出した。
    - FFmpeg probe failure時に`serveBoundary`が0回であり、HTTP listener作成境界へ到達しないことをtestで固定した。

### 詰まりと回避

- race実行時、helper subprocessがmarker fileを作成してからPIDを書き終えるまでの短い間にparentがempty fileを読むcaseが1回発生した。markerが存在するだけで開始完了とせず、整数PIDを完全にparseできるまで有限tickerで待つよう修正した。
- RTC pointer identity testはloopback socketを使うためsandbox内では実行できない。attempt 1と同様にsandbox外でfocused raceおよび全module通常/race testを実行した。

### Verification

- `go test ./... -count=1`: PASS
- `go test -race ./internal/media/... -count=1`: PASS
- `go test -race ./... -count=1`: PASS
- `go vet ./...`: PASS
- `go mod tidy -diff`: PASS、差分なし
- `npm run tasks:check`: PASS（273 tasks）
- `npm run tasks:index:check`: PASS（13 categories、変更なし）
- `npm run commit:check`: PASS（final HEAD）
- `npm run gate`: PASS（final HEAD `a3b216a`; lint / build / test、frontend 85 passed + 1 skipped、577 tests passed + 2 skipped）

### ドキュメント同期

- 公開API、通信契約、flag、runtime対応version、利用者向け挙動はattempt 2で変更していないため、README/設計文書の追加同期は不要。
- 追加したWAVはtest内生成でrepository fixtureを増やしていない。既存4 fixtureと生成command/SHA-256はattempt 1のREADME記録を維持する。
- startup変更は既存の「probe failureはlistener前startup error」という公開挙動をtest seamへ抽出しただけで、READMEの記述と一致している。

### Comment audit差分

| path                                             | symbol / block / decision / flow                 | kind                      | current comment                                                                                                           | reader question                                                               | required reader knowledge                                                                                             | decision | action / omission reason                                                                                                                   | reviewer note                                                                           |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `cmd/pion-poc/main.go`                           | `run -> runWithBoundaries -> serveBoundary`      | orchestration / lifecycle | attempt 1の`run`/`newSynthDecoder` commentはprobeがlistener前であることを説明するが、抽出したboundaryと非到達条件は未記載 | probe failureがどの構築段階を止め、listenerへ到達しないことをどこで保証するか | config後にprobeを完了し、pipeline/Manager/registry構築と`serveBoundary`は成功後だけ進む。注入はtest専用の順序固定seam | add      | `serveBoundary`へlistener lifecycleへ移る最終境界を追加し、`runWithBoundaries`へ順序、failure時非呼出、runner/serve注入理由をdoc comment化 | fake probe failureでserve call 0、production `run`がreal runner+`serve`を渡すことを照合 |
| `internal/media/synthdecode/decoder_test.go`     | 4 MIME error matrix                              | test only                 | production comment audit対象外                                                                                            | 各形式が同じvalidation/limit/cancel契約を通るか                               | 各caseのKindとpartial result破棄                                                                                      | n/a      | test-only。production commentの追加・変更なし                                                                                              | nested tableの4形式×5異常を照合                                                         |
| `internal/media/synthdecode/integration_test.go` | deterministic stereo WAV / real malformed matrix | test fixture / data       | production comment audit対象外                                                                                            | golden入力のformatと左右値は何か                                              | 48 kHz stereo s16le、左右定数、real FFmpeg decode                                                                     | add      | test helperへWAV表現と左右差を置く理由をcomment化                                                                                          | header単位、全PCM値、mora境界を照合                                                     |
| `internal/media/synthdecode/runner_test.go`      | helper subprocess lifecycle                      | test lifecycle            | production comment audit対象外                                                                                            | helperがいつ実行中と確定し、joinをどう観測するか                              | marker PID、cancel/timeout、return後ESRCH、fd/goroutine convergence                                                   | n/a      | helper名・mode・同期関数でflowが局所化され、production codeではないためproduction comment追加なし                                          | running cancel/timeoutとsuccess/error/cancel反復を照合                                  |
| `internal/rtc/session_test.go`                   | Manager builder pointer/closer ownership         | test lifecycle            | production comment audit対象外                                                                                            | どのcloser集合を数えるか                                                      | Decoderは非所有、所有resourceは3件                                                                                    | add      | exactly 3件をwrapper計数するblockへ、Decoder非混入を固定する目的を近接comment化                                                            | request/Session pointerと別Session不変を照合                                            |

### 仕様からの逸脱

- なし。

### 残リスク

- helper subprocess resource testはLinuxのPID signalと`/proc/self/fd`を使う。PoCの対応platformはLinuxであり対象環境と一致する。
- production container/composeへのFFmpeg導入はattempt 1記録どおりPhase 4の責務。
