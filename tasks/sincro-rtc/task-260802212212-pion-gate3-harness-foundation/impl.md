# 実装記録: task-260802212212-pion-gate3-harness-foundation

## 完了時の要約

-

## 不合格分類

none

## 検証結果

-

## 未実行の確認

-

## attempt 1

### 判定

実装コミット `c5e82c2379921616110e0bc6e9d9eb5223dbed6e` まで作成したが、root
`npm run gate` の lint が本タスク差分外の既存 Markdown 10件で失敗したため完了判定にはしない。
対象には変更禁止の本タスク `task.md` が含まれる。他9件も無関係な task 状態文書であり、
実装ブランチへ整形差分を混ぜなかった。build と test の2段は同じ clean commit で個別に PASS した。

### 事前の実行条件確認

- 専用 worktree `/tmp/eval-a47e4f16443b-SEnKbr` は受領時に detached HEAD で指定ブランチが
  存在しなかったため、基点 `a47e4f16443b31ceaf76898aa2d9909ee7e7a62c` から
  `codex/task-260802212212-pion-gate3-harness-foundation` を作成した。
- `/proc`、Go 1.26.5、Node.js 24.18.1、FFmpeg 6.1.1、既存 Go module cache、
  Go toolchainを確認した。通常の Go cache は sandbox から read-only だったため、
  `GOCACHE=/tmp/gate3-foundation-gocache` と既存
  `GOMODCACHE=/tmp/sincromisor-attempt4-gomodcache` を使用した。
- Chromium、Consul、Frontend `dist` は未配置だった。本タスクはこれらを起動しない単体基盤であり、
  fake executable / HTTP固定応答で検査するため実装阻害ではない。未配置を許容して開始するのではなく、
  `harnessenv.Load` の実利用時には全件 error にする。
- 音声固定データは本タスク成果物として既存公開 fixture `utils/test-nue/sample.wav` と同内容を
  `internal/gate3/testdata/gate3-input.wav` へ配置した。FFprobe で PCM 16-bit、16 kHz、
  mono、4.714688秒を確認した。
- loopback socket は通常 sandbox で拒否されたため、`httptest` を使う Go test だけ承認済みの
  sandbox外実行へ切り替えた。外部 network や実サービスは利用していない。

### 判断と review.md 申し送りへの対応

- goroutine は `PID == os.Getpid()` の場合だけ採取する。子 process mode は baseline と sample の
  `goroutines=null` を要求し、test process の値で代用しない試験を追加した。
- `Wait(context.Context)` は完了 channel を mutex外で待つ。caller timeoutでは
  `ErrWaitTimeout` と context errorだけを返し、processとbackground waiterを変更しない。
  `Wait` 先行と `Close` 先行の両方向を race testで固定した。
- report公開は0600一時fileのwrite/fsync/close、hard link、unlink、directory fsyncの順にした。
  link後のunlinkまたはdirectory fsync失敗はtargetを残し、`PublishError.TempPath` と原因を返す。
- scenario / cleanup の許容enumだけでなく、`PASS`と非`NONE`、`FAIL/NOT_OBSERVED`と`NONE`、
  cleanup `PASS`と非null error、cleanup `FAIL`とnull/空 errorを全て拒否する試験を追加した。
- `Close` / `Wait` / `Signal` のStart前は `ErrNotRunning`、`Close` 後のStartは
  `ErrAlreadyStarted` とした。process起動の試行失敗も再利用を許さない。

### 受け入れ条件との対応

- AC1-2: `harnessenv` で固定 repository入力、5実行file、version、symlink、権限を検査し、
  検査済み `Environment.Go.Path` を `GoCommand` と `BuildPion` の両方へ固定した。
- AC3: `process.Owner` に `new → running → exited`、各1 MiB末尾出力、signal、再試行可能なWait、
  SIGTERM / 1秒 / SIGKILL / joinを集約した。
- AC4-5: `resources.Sampler` に250ms worker、procfs / metrics / statuses の全件sample、
  診断分離、3 sample最大baseline、10秒以内の3回連続収束を実装した。
- AC6: `report` にschema version 1の型、必須値・enum・時刻・ID・整数単位の検証、
  非上書きhard-link writerを実装した。
- AC7: 外部service / Chromiumを起動しないfake executable、子process、proc固定データ、
  HTTP固定応答の単体試験と、実procfs / Prometheus text / hard linkの短いlocal契約試験を追加した。
- AC8: 下記9列のコメント点検を全件実施した。

### コメント点検

| パス                                      | シンボル・処理群・判断                                           | 種類                       | 現在のコメント     | 読者の疑問                                                 | 読者に必要な知識                                                         | 判断 | 対応または省略理由                                                                             | レビュー担当者メモ                                              |
| ----------------------------------------- | ---------------------------------------------------------------- | -------------------------- | ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `internal/gate3/harnessenv/doc.go`        | package全体と隣接packageへの接続                                 | 案内                       | 新規のため既存なし | 何を事前確定し、後段へ何を渡すか                           | PATH再探索禁止とrepository所有入力の境界                                 | 追加 | package commentで入力検査の位置と後段の利用制約を説明した                                      | `go doc`単独でscopeと非対象が読めるか                           |
| `internal/gate3/harnessenv/env.go`        | `Input`、`Tool`、`Environment`                                   | API・データ                | 新規のため既存なし | path、version、SHA256、zero/nilの意味は何か                | 解決済み絶対path、version先頭行、所有fileだけdigestを持つこと            | 追加 | 各公開型の責務とimmutable運用、nilの意味をdoc commentへ記録した                                | 成果物へ転記する値と実行境界の区別が読めるか                    |
| `internal/gate3/harnessenv/env.go`        | `Load`、`load`、`inspectTool`の検査工程                          | 外部入力境界・処理の流れ   | 新規のため既存なし | どの順で何を拒否し、失敗時に部分値が残るか                 | 静的path検査後だけversion processを起動し、全体errorにすること           | 追加 | 公開契約と、相対path等をprobe失敗へ曖昧化しない工程コメントを追加した                          | 未設定・相対・欠落・権限・versionの分類を追えるか               |
| `internal/gate3/harnessenv/validation.go` | 所有path、version、module root検査群                             | 制約・代替処理             | 新規のため既存なし | symlink外逃げと`-trimpath` build後のmodule解決をどう防ぐか | cwdから`go.mod`へ上昇し、所有pathは解決後もrepository内に限定すること    | 追加 | helper名と型で局所検査は読めるため逐語説明は省略し、非局所順序はcaller側工程コメントへ集約した | privateを理由にせず、callerとhelperを合わせて失敗条件が読めるか |
| `internal/gate3/harnessenv/command.go`    | `GoCommand`、`BuildPion`                                         | process境界・API           | 新規のため既存なし | buildと証拠再実行が同じbinaryか、出力先条件は何か          | `exec.Cmd.Path`固定、module root固定、絶対出力先、結合出力               | 追加 | 両APIのPATH非依存、引数、Dir、副作用、error出力を説明した                                      | `go build -trimpath`のargvが契約どおりか                        |
| `internal/gate3/process/owner.go`         | error、`State`、`Command`、`Result`、`Owner`                     | API・状態・生存期間        | 新規のため既存なし | zero value、Env継承、出力単位、再利用可否は何か            | 完全Env、各1 MiB、New必須、単調stateと有限error                          | 追加 | 公開型・enum・errorに入力、単位、所有権、zero value制約を追加した                              | 公開fieldだけ見てもprocess所有契約を誤解しないか                |
| `internal/gate3/process/owner.go`         | `Start`、`collectExit`                                           | 状態遷移・event発生元      | 新規のため既存なし | 誰が`running → exited`を行い、結果をいつ固定するか         | Start一回、background waiterだけがexit結果と出力を確定すること           | 追加 | Startの失敗・副作用と、waiterが同じlock acquisitionで結果を公開する流れを説明した              | start失敗、正常exit、非zero exitの所有権を追えるか              |
| `internal/gate3/process/owner.go`         | `Signal`、`Wait`                                                 | API・並行処理              | 新規のため既存なし | caller timeoutがprocessを止めるか、mutexを保持するか       | timeoutは待機だけ、doneはmutex外、終了後は同じResultを返すこと           | 追加 | review申し送りの非破壊timeoutと再試行契約をdoc commentへ固定した                               | Wait先行でもCloseが進めるかを実装とrace testで照合する          |
| `internal/gate3/process/owner.go`         | `Close`、`close`                                                 | cleanup・制約              | 新規のため既存なし | TERM/KILL/join順序とerror結合はどうなるか                  | `sync.Once`、1秒猶予、期限なしjoin、wait/signal/kill errorを保持すること | 追加 | 公開契約に終了責務を記録し、内部関数は同じ直線的工程のためdoc重複を省略した                    | Close先行・Wait先行・TERM無視でprocessが残らないか              |
| `internal/gate3/process/tail.go`          | `tailBuffer`の末尾保持判断                                       | データ・制約               | 新規のため既存なし | 上限超過時にどこを捨て、境界値はどうなるか                 | producerごとに独立し、古いbyteだけを破棄すること                         | 追加 | 1 MiB判断の理由と診断に末尾を残す意図を処理群コメントへ追加した                                | exact / over limit試験と`truncated`が一致するか                 |
| `internal/gate3/resources/types.go`       | `Config`、`Sample`、`Queues`、`Diagnostic`、`Result`、`Baseline` | API・データ                | 新規のため既存なし | 各値の所有process、時刻、単位、nilは何か                   | UTC、item数、PID、同一processだけgoroutine、3 sample最大値               | 追加 | schemaとnil/単位/前提を型コメントへ記録した                                                    | JSON fieldとtask schemaが一対一か                               |
| `internal/gate3/resources/collect.go`     | `collector.collect`とproc / metrics / status変換                 | 外部境界・処理の流れ       | 新規のため既存なし | 部分成功をsampleへ入れるか、3境界をどう結ぶか              | 全境界成功だけSample化し、session値の不一致も診断にすること              | 追加 | raw入力からdomain Sampleへの工程と部分破棄を説明した                                           | malformed metrics、status、消失PIDでsampleが残らないか          |
| `internal/gate3/resources/collect.go`     | fd snapshot後の`ENOENT`                                          | 代替処理・判断             | 新規のため既存なし | fd closeとのraceを欠損扱いにする理由は何か                 | FDCountにはsnapshot entryを含め、既に閉じたsocket所有は数えないこと      | 追加 | 一見した無視が必要なprocess raceであるため近接コメントを追加した                               | 実procfs契約試験がflakyにならず、他errorを隠さないか            |
| `internal/gate3/resources/sampler.go`     | `Sampler.Start`、`run`、`Stop`                                   | worker生存期間・状態遷移   | 新規のため既存なし | cancel、join、deadline、二重開始、失敗sampleの行先は何か   | `idle → sampling → stopped`、Stop owner、deadline error、診断列          | 追加 | public lifecycleとworker event sourceをdoc/commentで説明した                                   | cancel後にgoroutineが残らず、deadlineだけerrorになるか          |
| `internal/gate3/resources/sampler.go`     | `SampleOnce`、`Result.WriteJSON`                                 | API・保存境界              | 新規のため既存なし | 同期採取とworkerの契約差、既存fileの扱いは何か             | 同じ全境界検査、部分値なし、絶対path、0600、非上書き                     | 追加 | 入出力、失敗、副作用、公開reportとの責務差を説明した                                           | raw観測原本と公開成果物writerを混同しないか                     |
| `internal/gate3/resources/convergence.go` | `BaselineFrom`、`CaptureBaseline`                                | 経験則・処理の流れ         | 新規のため既存なし | どの3 sampleを基準にし、何を最大化するか                   | ready、非draining、session 0、250ms、同一processだけgoroutine            | 追加 | 取得前提、回数、間隔、最大値、戻り値をdoc commentへ記録した                                    | session開始前条件と子processのnullが守られるか                  |
| `internal/gate3/resources/convergence.go` | `Converged`、`WaitForConvergence`                                | 経験則・期限               | 新規のため既存なし | 閾値、連続回数、10秒、goroutine追加条件は何か              | session/queue=0、fd/socket+2、goroutine+5、3回連続                       | 追加 | しきい値とmode差、期限時error、sample出力をdoc commentへ記録した                               | 非連続sampleや閾値+1で誤PASSしないか                            |
| `internal/gate3/report/types.go`          | enum、`Input`、`Scenario`、`Cleanup`、`Document`                 | schema・API                | 新規のため既存なし | enumの意味、cleanup独立性、observations単位は何か          | schema version 1、nullable SHA/error、duration/countは整数               | 追加 | 各公開型・enumへ用途と組合せの前提を記録した                                                   | JSON key、null、有限enumがschema正本と一致するか                |
| `internal/gate3/report/validate.go`       | `Validate`と再帰的observations検査                               | 検証境界・データ変換       | 新規のため既存なし | 必須欠落、重複、時刻、enum矛盾をいつ拒否するか             | 公開前の全document検査、UTC、ID regex、integer field                     | 追加 | 公開APIと内部の整数単位判断へ目的を記録し、個別guardの逐語説明は省略した                       | 全拒否matrixとmarshal前検査を照合する                           |
| `internal/gate3/report/writer.go`         | `Writer.Write`                                                   | filesystem境界・処理の流れ | 新規のため既存なし | 原子公開順序、既存target、link前後failureの成果物は何か    | 0600 temp、file fsync、link、unlink、directory fsync、target保持         | 追加 | API docで順序・副作用・失敗時成果物を記録した                                                  | renameを使わず同一directory hard linkか                         |
| `internal/gate3/report/writer.go`         | `PublishError`                                                   | API・cleanup               | 新規のため既存なし | link後failureをcallerがどう記録・清掃するか                | targetは残し、temporary候補pathと原因を`errors.As/Is`可能にすること      | 追加 | target、TempPath、Unwrapの観測可能な契約を説明した                                             | unlink / directory fsync注入試験で情報が失われないか            |

test code、`internal/gate3/README.md`、固定 WAV は本番ソースコメント点検の対象外とした。
test名自体から各error分岐とstate順序を追跡できるようにし、READMEはMarkdown規約、
WAVはFFprobeで固定データ契約を別途確認した。TODO、古いcomment、削除対象commentは存在しなかった。

### ドキュメント同期

`internal/gate3/README.md` に必要環境、絶対path規則、process cleanup、250ms採取、
baseline / 3回連続収束、同一processだけのgoroutine条件、schema version 1、
hard-link公開順序、ブラウザーとGate判定が非対象であることを同期した。
公開RTC endpoint / JSON / DataChannel契約と本番Pion挙動は変更していないため、
`documents/design/contracts/frontend-rtc.md` 等の公開契約文書は同期不要と判断した。

### 検証結果

- PASS: `go test -race -tags=gate3 ./internal/gate3/harnessenv ./internal/gate3/process ./internal/gate3/resources ./internal/gate3/report`
- PASS: `go vet -tags=gate3 ./...`
- PASS: tagなし `go test ./...`
- PASS: tagなし `go vet ./...`
- PASS: 明示的な `/tmp/go1.26.5-toolchain/bin/go build -trimpath -o /tmp/gate3-foundation-pion-poc ./cmd/pion-poc`
- PASS: `npm run tasks:check`
- PASS: 新規 `internal/gate3/README.md` 単体の Prettier check
- PASS: `npm run commit:check`
- PASS: clean commit `c5e82c2` の `npm run gate -- build`
- PASS: clean commit `c5e82c2` の `npm run gate -- test`
- FAIL: clean commit `c5e82c2` の `npm run gate`。`gate:lint` 内のMarkdown検査が
  本差分外の既存10ファイルで失敗した。対象は
  `tasks/sincro-rtc/task-260802032922-pion-phase-3-observability-gate-3/{eval.md,impl.md}`、
  `task-260802182106-pion-gate-3-production-validation-harness/task.md`、
  `task-260802212208-pion-graceful-shutdown-admission-window/task.md`、本タスク `task.md`、
  後続Gate 3タスク4件の `task.md` と1件の `review.md` である。

### 逸脱・詰まり・残リスク

- 仕様からの実装逸脱はない。
- 必須3点gateのうち lint が既存状態文書の整形不備で失敗している。変更禁止の承認済み `task.md` と
  無関係taskを実装コミットで変更する権限がないため、attempt 1では解消できない。
- Chromium、Consul、Frontend `dist` を実際に用いる観測は明示どおり後続entrypointの責務である。
  本タスクでは実呼びを完了証拠にしていない。

## attempt 2

### 評価残課題への対応

- `process` の1秒猶予と1 MiB出力上限、`resources` の250ms、3 sample、3回連続、
  10秒、fd/socket `+2`、goroutine `+5` について、値を緩めた場合のleak見逃し・harness停滞・
  成果物肥大と、厳しくした場合の正常cleanup中断・正常系誤失敗・診断欠落を近接コメントへ記録した。
  変更時に再確認する実Pion終了、TERM無視helper、stdout/stderr境界、実Registry/procfs、
  child/same-process mode、収束列とcontext期限も具体化した。
- `observability.NewRegistry().Handler()` をそのまま`resources.collector`の`/metrics`へ接続し、
  active session、存在する`input` queue、producerが出力しない3 queueの0補完を検証する
  local契約試験を追加した。手書きPrometheus文字列だけを本番境界の証拠にしていない。
- productionの250ms/10秒を変えない非公開`samplerTiming` seamを追加した。
  `CaptureBaseline`の3回実採取、`WaitForConvergence`の`good, good, bad, good, good, good`、
  fd閾値を1超えた内部期限、より早いcaller contextを直接検証した。
- `report.Writer`の一時file `Sync` を失敗注入し、原因errorの保持、target未作成、
  temporary file削除を検証した。scenario `PASS`かつcleanup `FAIL`と非空errorの
  有効な正方向組合せも追加した。
- test fileが300行を超えないよう、producer契約と収束orchestrationを責務別fileへ分割した。

### コメント点検

| パス                                      | シンボル・処理群・判断                                     | 種類               | 現在のコメント                                                | 読者の疑問                                                            | 読者に必要な知識                                                                                                                                            | 判断     | 対応または省略理由                                                                                                                                  | レビュー担当者メモ                                                         |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `internal/gate3/process/owner.go`         | `closeGrace`と`Owner.Close`                                | 経験則・生存期間   | attempt 1はSIGTERM、1秒、SIGKILL、joinの順序だけを説明        | なぜ1秒か、短縮・延長すると観測上どう失敗し、何を再確認するか         | 短縮は正常session/socket cleanupをSIGKILLで中断し、延長は壊れたprocessでscenario回収を停滞させる。実PionのTERM終了とTERM無視helperのKILL/joinが変更境界     | 書き直し | `closeGrace`近接コメントへ両方向の誤調整failure modeと、正常/強制終了の確認境界を追加した。`Close`の公開契約は順序とerror結合を既に覆うため維持した | 1秒の値を変えるreviewで正常cleanupと強制終了の片側だけを確認していないか   |
| `internal/gate3/process/owner.go`         | `outputLimit`と`Output`                                    | 経験則・データ     | attempt 1は1 MiB末尾保持と`truncated`だけを説明               | 上限を下げる/上げると診断と成果物へどう現れ、どの境界を試すか         | 短縮は失敗原因を先頭側から欠落させ、拡大はstdout/stderrとscenario数に比例して成果物を肥大化させる。exact/over、両stream、末尾、flagが変更境界               | 書き直し | 上限定義の近接コメントを正本にし、`Output`からその判断へ接続した                                                                                    | stdoutだけ、または超過だけの確認で境界値を変更していないか                 |
| `internal/gate3/process/tail.go`          | `tailBuffer`の上限超過処理                                 | データ変換         | attempt 1は古いbyteを捨て末尾を残す理由を説明                 | private bufferと公開1 MiB契約の関係はどこにあるか                     | bufferは任意limitの変換を担当し、Gate 3の上限判断は`outputLimit` / `Output`が所有する                                                                       | 書き直し | 重複した値判断を置かず、公開結果側の変更リスク・確認境界へ接続するコメントに更新した                                                                | privateを理由にせず、上位contractへの導線が局所的に読めるか                |
| `internal/gate3/resources/types.go`       | `sampleInterval`と`baselineSampleCount`                    | 経験則・観測       | attempt 1は250msと3 sampleの存在だけを説明                    | 間隔・個数の誤調整で何を見逃し、何を誤失敗にするか                    | 長い間隔はsample間で解消する短時間leakを見逃し、過短間隔や少数sampleはscheduler揺れでbaselineを不安定にする。実Registry/procfsとCaptureBaseline列が変更境界 | 追加     | 閾値をnamed constへ集約し、両方向のfailure modeとproducer/orchestration確認先を近接記録した                                                         | 250msを単体timer値だけで変更せず、観測producerと3回列を通しているか        |
| `internal/gate3/resources/types.go`       | `convergenceTimeout`と`requiredStableRuns`                 | 経験則・期限       | attempt 1は10秒と3回連続の存在だけを説明                      | 値を緩める/厳しくする場合、leak見逃しと正常誤失敗はどう変わるか       | 連続数の緩和は一過性ゼロ後の再増加を見逃し、厳格化は正常cleanupの揺れを誤失敗にする。期限延長はharness停滞、短縮は正常cleanup誤失敗になる                   | 追加     | 非連続列、3連続列、閾値超過、内部/外部期限を一組で確認するコメントを追加した                                                                        | 個々の定数試験だけでなく実`WaitForConvergence`を通しているか               |
| `internal/gate3/resources/types.go`       | `resourceHeadroom`と`goroutineHeadroom`                    | 経験則・mode制約   | attempt 1はfd/socket `+2`、goroutine `+5`のみ説明             | headroomを広げる/狭めると、どのresourceを誤分類するか                 | 拡大はsession由来leakを正常化し、縮小は採取用fdやruntime workerをleakと誤認する。実procfs、childのnil、same-processのruntime値、閾値+1が変更境界            | 追加     | magic numberをnamed constにし、誤分類の対象とmode別確認境界を追加した                                                                               | child PIDへtest goroutineを代入せず、両modeの閾値を見ているか              |
| `internal/gate3/resources/convergence.go` | `BaselineFrom`と`CaptureBaseline`                          | 処理の流れ・経験則 | attempt 1はreadiness/session前、3 sample最大値、250msだけ説明 | sample数・間隔を変えた際のbaseline過小/過大評価は何か                 | 少数sampleはpeakを逃して正常cleanupを誤失敗にし、session開始後まで増やすとsession resourceをbaselineへ混ぜてleakを見逃す                                    | 書き直し | API近接コメントへfailure modeを追加し、短いtiming seamと実producer/procfsの二層確認を指定した                                                       | `CaptureBaseline`を直接呼び、3 sampleの時刻と最大値を確認しているか        |
| `internal/gate3/resources/convergence.go` | `Converged`と`WaitForConvergence`                          | 処理の流れ・期限   | attempt 1は3連続、各headroom、10秒だけ説明                    | 非連続の一過性ゼロ、閾値超過、caller期限を実orchestrationがどう扱うか | 緩和は再増加leakを見逃し、厳格化は観測揺れで誤失敗にする。内部上限とcaller期限はいずれもticker/HTTP requestを残さず終了する必要がある                       | 書き直し | 非連続/連続、閾値+1、内部timeout、caller contextを変更確認境界としてdoc commentへ追加した                                                           | 純粋`Converged`だけでなくcollectorを通る待機loopを検証しているか           |
| `internal/gate3/resources/sampler.go`     | `samplerTiming`、`newSamplerWithTiming`、`Sampler.timeout` | test seam・制約    | attempt 1にはproduction timingのみでorchestration seamなし    | 短時間testのためにproduction契約を可変公開していないか                | `NewSampler`は常に250ms/10秒を使い、非公開seamだけがpositive durationを検査してtest時間を短縮する                                                           | 追加     | 引数上限を守る内部options型を追加し、公開APIを拡張せずseamの位置と非対象をコメントした                                                              | production constructorの既定値を直接試験し、seamが外部契約になっていないか |

新規・変更test codeは本番ソースコメント受け入れ条件の対象外だが、評価残課題との対応を
test名とfile責務から追跡できるようにした。

- `registry_contract_test.go`: production `observability.Registry.Handler`からcollectorへの接続。
- `convergence_orchestration_test.go`: baseline、連続/非連続、閾値、期限の実loop。
- `report_test.go`: 一時file fsyncの公開前failure artifactと有効cleanup失敗schema。

既存commentの削除はなく、上記以外のattempt 1監査対象は実装変更がないため維持した。
TODO、古いcomment、コメントアウトしたcodeは存在しない。

### ドキュメント同期

公開API、RTC契約、README記載のproduction値は変更していない。
`internal/gate3/README.md` の250ms、3 sample、3回連続、10秒、`+2`、`+5`、1秒、
1 MiB、schemaは実装と引き続き一致するため文書差分は不要と判断した。
attempt 2は近接ソースコメントと局所testの補強だけであり、生成物・配布物の再生成も不要である。

### 検証結果

- PASS: `go test -race -tags=gate3 ./internal/gate3/harnessenv ./internal/gate3/process ./internal/gate3/resources ./internal/gate3/report`
- PASS: `go test -race -tags=gate3 -count=25 ./internal/gate3/resources -run 'Test(CaptureBaseline|WaitForConvergence|CollectorConsumesProductionRegistry)'`
- PASS: `go test -race -tags=gate3 -count=10 ./internal/gate3/report -run 'Test(WriterTemporaryFileSyncFailure|ValidateAcceptsCleanupFailure)'`
- PASS: tagなし `go test ./...`
- PASS: tagなし `go vet ./...`
- PASS: `go vet -tags=gate3 ./...`
- PASS: `gofmt -l internal/gate3`は出力なし
- PASS: `npm run tasks:check`
- PASS: clean commit `4754253` の `npm run commit:check`
- PASS: clean commit `4754253` の `npm run gate -- build`
- PASS: clean commit `4754253` の `npm run gate -- test`
- FAIL: clean commit `4754253` の`npm run gate`。attempt 1および評価と同じ、
  本差分外の既存Markdown 10件による`gate:lint`失敗を再現した。変更禁止の本タスク`task.md`と
  無関係taskは変更していない。

### 詰まりと修正

新しいcaller context試験の反復初回で、期限到達前に最低1 sampleを必須とするassertが1回失敗した。
contextは最初の250ms相当tickより前にも正当に終了できるため、sample数条件は製品契約ではなかった。
`errors.Is(err, context.DeadlineExceeded)`だけを契約として残し、修正後にraceで25回反復して安定を確認した。

### コミットと残リスク

- attempt 2 commit: `4754253ecdedf234f5940ba0042ac5fbbad113c4`
- attempt 1からの範囲:
  `c5e82c2379921616110e0bc6e9d9eb5223dbed6e..4754253ecdedf234f5940ba0042ac5fbbad113c4`
- 仕様逸脱: なし。
- 残blocker: root gate lintの既存Markdown 10件。評価指示どおり本再実装では整形していない。
