# Pion Gate 3検証ハーネスの共通基盤を実装する

## 背景 / 目的

Gate 3の各検証で重複する外部入力検査、子プロセス監督、資源採取、成果物schemaを先に固定する。
本タスクはブラウザー、WebRTC境界クライアント、下流サービス障害を扱わず、後続タスクが利用する
小さなGo packageだけを提供する。

## 完了条件（受け入れ条件）

- [ ] `internal/gate3/harnessenv`でrepository root、Frontend `dist`、音声固定データ、
      Go、Node.js、Chromium、Consul、FFmpegの絶対pathとversionを開始前に全件検査する。
      未設定、相対path、実体欠落、実行権限欠落、repository外へ解決する所有ファイルのsymlinkはerrorにする。
- [ ] `SINCRO_GATE3_GO_BINARY`で検証した絶対実行ファイルを、既存試験証拠の再実行だけでなく
      `go build -trimpath -o <絶対出力先> ./cmd/pion-poc`にも使う。暗黙の`PATH`探索を行わない。
- [ ] `internal/gate3/process`で子プロセスの起動、標準出力・標準errorの有限量保存、signal送信、
      `Wait`、期限超過時の強制終了を一つの所有者にまとめる。状態は`new`、`running`、`exited`の
      単調遷移とし、終了時に子プロセスを残さない。
- [ ] `internal/gate3/resources`で対象Pion PIDの`/proc/<pid>/fd`、重複なしsocket inode、
      `/metrics`のactive session・4 queue、`/api/v1/RTCSignalingServer/statuses`を
      250ms間隔で採取し、JSONへ保存する。Linux以外と`/proc`欠落はskipせずerrorにする。
- [ ] 基準値はreadiness後かつsession開始前の3 sampleの最大値とする。session終了後は10秒以内に
      active sessionと4 queueが全て0、fd・socketが基準値+2以下のsampleが3回連続した場合だけ
      収束と判定する。同一process modeではこれにgoroutineが基準値+5以下も加える。
      goroutineは対象PIDが現在のtest processと同じ場合だけ`runtime.NumGoroutine`で採取する。
- [ ] `internal/gate3/report`で`schema_version=1`、対象commit、検証済み入力、scenario ID、
      開始・終了時刻、判定、失敗分類、観測値、cleanup結果を持つ成果物を検証して原子的に書く。
      必須field欠落、未知の判定値、同じscenario IDの重複、既存出力先はerrorにする。
- [ ] 本タスクの単体テストは外部サービスやChromiumを起動せず、偽の実行ファイル、子プロセス、
      `/proc`固定データ、HTTP固定応答で後述の状態・error分岐を検証する。
- [ ] 変更対象と変更理解範囲のコメント点検を`impl.md`へ全件記録する。

## 設計判断（着手前に確定済み）

- packageは`internal/gate3/{harnessenv,process,resources,report}`へ分ける。上位の統合packageを本タスクで作らない。
- 外部入力は`SINCRO_GATE3_{GO,NODE,CHROMIUM,CONSUL,FFMPEG}_BINARY`だけを環境変数にする。
  repository rootはmodule rootから`../..`で解決する。Frontendは
  `<repo>/sincromisor-frontend/dist`、音声は
  `<module>/internal/gate3/testdata/gate3-input.wav`の固定pathを使う。
- version probeはGo=`version`で`go.mod`のmajor / minor一致、Node.js=`--version`で18以上、
  Chromium=`--version`、Consul=`version`、FFmpeg=`-version`とする。後3つはexit 0と
  空でない先頭行を必須にし、解決済みpath、完全な出力先頭行を成果物へ記録する。
- `process.Command`の最小schemaは`Path string`、`Args []string`、`Env []string`、
  `Dir string`とし、`Path`と`Dir`は絶対pathだけを受理する。`Env`は継承でなく完全な環境とする。
- stdout / stderrは各1 MiBまで末尾を保持し、超過時は`truncated=true`を記録する。
  APIは`Start() error`、`Signal(os.Signal) error`、`Wait(context.Context) (Result, error)`、
  `Close() (Result, error)`に固定する。`Start`は1回だけ、`Signal`はrunningだけとする。
  `Wait`は完了channelをmutex外で待ち、context期限ではprocessを変更せず`ErrWaitTimeout`を返す。
  後続の`Wait`は再試行でき、process終了後は保存済みの同じ`Result`を返す。
  `Close`は`sync.Once`でSIGTERMを送り、1秒後もrunningならSIGKILLし、期限なしでbackground waiterをjoinする。
  `Wait`先行時もmutexを占有しないため`Close`が進行し、`Close`先行時の後続`Wait`も同じ`Result`を得る。
  `Wait`はprocess終了結果だけ、`Close`はそれにsignal / kill errorを`errors.Join`して返す。
  `ErrNotRunning`、`ErrAlreadyStarted`、`ErrWaitTimeout`を`errors.Is`可能な有限分類にする。
- `resources.Sample`は`at`、`pid`、`fd_count`、`socket_inodes`、`goroutines|null`、
  `sessions`、`session_limit`、`ready`、`draining`、`queues`を持つ。`queues`は
  `input`、`speech`、`text`、`telop`を必須とし、Prometheus series欠落は0として補う。
  fdは`/proc/<pid>/fd`の全entry数、socketは`socket:[inode]` symlinkの重複なし数とする。
  一入力でも取得・parseに失敗した回はsample列へ追加せず、診断errorとして保存する。
- 成果物JSONは次の最小schemaを正本とする。

```text
schema_version: 1
commit: 40文字の小文字hex
inputs[]: {name, path, version, sha256|null}
scenarios[]: {
  id, status=PASS|FAIL|NOT_OBSERVED,
  started_at, ended_at,
  failure_class=NONE|HARNESS|PRODUCT|ENVIRONMENT,
  observations: object,
  cleanup: {status=PASS|FAIL, error|null}
}
```

時刻はUTCのRFC 3339で`started_at <= ended_at`、durationとcountは整数、scenario IDは
`^[A-Z0-9]+(?:-[A-Z0-9]+)+$`とする。同一document内のID重複、必須field欠落、enum矛盾を拒否する。
writerは同directoryの0600一時fileをfsync後、hard linkで既存targetを上書きせず公開し、
directoryもfsyncする。scenario失敗でもcleanupを確定してからdocumentを渡す。

- enumの組合せは、`PASS`なら`failure_class=NONE`、`FAIL`または`NOT_OBSERVED`なら
  `failure_class=HARNESS|PRODUCT|ENVIRONMENT`とする。cleanupは`PASS`なら`error=null`、
  `FAIL`なら空でないerrorを必須にし、scenario判定とは独立して記録する。
- 本番実測の非公開出力先は後続entrypointが指定する。本タスクは出力schemaと上書き拒否だけを所有する。

## スコープ境界

- 本タスク: 共通package、単体テスト、`internal/gate3/README.md`の基盤利用方法。
- 後続タスク: Consul起動、通信proxy、Playwright、境界クライアント、scenario集約。
- スコープ外: Pion本番コード、Frontend、Pythonサービス、Gate 3判定。

## 高リスク統合タスクの追加設計

| 資源           | 作成者              | 正常終了                | 期限超過               |
| -------------- | ------------------- | ----------------------- | ---------------------- |
| 子プロセス     | `process.Owner`     | SIGTERM後`Wait`         | 1秒後SIGKILLして`Wait` |
| 採取worker     | `resources.Sampler` | context cancel後join    | errorとして終了        |
| 成果物一時file | `report.Writer`     | hard link公開後にunlink | link失敗時にunlink     |

上位scenarioが失敗してもcleanup結果を成果物へ残す。cleanup失敗は元の失敗を上書きせず、複合errorとする。
hard link失敗時はtargetを作らず一時fileを削除する。link成功後の一時file削除またはdirectory fsyncが
失敗した場合はtargetを残し、残った一時pathとerrorを返してcleanup `FAIL`として記録できるようにする。
採取workerは`idle → sampling → stopped`だけを許し、二重開始を`ErrAlreadyStarted`、
停止後の再開を`ErrStopped`とする。

## 実装方針（既存コード整合: file:line）

- `sincromisor-server/sincro-rtc-pion-poc/internal/config/config.go:43-109`のFrontend、
  FFmpeg、起動引数検査と矛盾しない絶対pathを渡す。
- `sincromisor-server/sincro-rtc-pion-poc/internal/observability/registry.go:107-137,237-240`の
  active sessionとqueue gaugeを採取する。queue series欠落は未使用の0として扱い、
  存在しないcodec active gaugeは要求しない。
- `cmd/pion-poc`と同じpackageのGate testが`runWithBoundaries`を起動する同一process modeでは、
  test PIDがPion runtimeの実所有processでもあるため`runtime.NumGoroutine`を採取する。
  build済みPionを起動する子process modeは再起動試験専用とし、goroutineをsampleへ要求しない。
- 成果物の公開・非公開境界は`tasks/README.md`の「公開成果物と非公開検証原本」に従う。

## テスト

- `go test -race -tags=gate3 ./internal/gate3/harnessenv ./internal/gate3/process ./internal/gate3/resources ./internal/gate3/report`
  と`go vet -tags=gate3 ./...`を通す。
- tagなしの`go test ./...`と`go vet ./...`、root `npm run gate`、`npm run tasks:check`を通す。
- 絶対Go pathのargvを記録する試験で、buildと既存試験再実行の両方が同じpathを使うことを固定する。
- processはstart失敗、二重start、signal前後、正常exit、`Wait`のcontext期限、SIGTERM timeout、
  SIGKILL、`Wait`先行 / `Close`先行、
  stdout / stderr境界を網羅する。resourcesは4 queue欠落=0、malformed metrics、消失PID、
  部分sample破棄、3回連続収束を網羅する。reportは全enum、重複ID、時刻逆転、既存target、
  link / fsync失敗を網羅する。
- 実Linux procfs、Prometheus text、同一filesystemのhard linkは短いローカル契約試験でも確認し、
  固定データだけで本番境界を証明したことにしない。

## ソースコードコメント受け入れ条件

新規public型・関数、外部入力境界、子プロセスの所有権、検査工程、採取workerの開始・取消・join、
sample変換、成果物検証・公開、package間の接続を変更理解範囲とする。目的、入力、観測可能な出力、
失敗、副作用、終了責務、単位を説明する。`impl.md`へ規約所定の9列で全件を記録し、弱い・古いコメントは
書き直すか削除する。TODO必須情報、省略条件、命名・関数分割・型による構造改善を点検し、
`private`、短さ、型、test、既存無commentを単独の省略理由にしない。評価担当は全件を照合し、
逐語説明、失敗・終了・処理の流れの不足、定型的な省略理由が1件でもあればFAILとする。

## ドキュメント同期の要否

要。`internal/gate3/README.md`へ必要環境、絶対path規則、資源収束条件、成果物schema、
本タスクがブラウザーやGate判定を行わないことを記録する。公開RTC契約は変わらない。

## 文書の言語

説明文は一般的な日本語を用い、package名、環境変数、schema field、単位だけ原表記を残す。
