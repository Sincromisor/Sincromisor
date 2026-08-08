# Gate 3 検証ハーネス

## 目的

このディレクトリは、Pion production candidate の Gate 3 検証で共有する事前入力検査、
子 process 管理、資源観測、成果物 schema と現行Frontendのブラウザー試験を提供する。
下流 service の障害注入と Gate 3 の最終判定は実行しない。

## 必要環境

Linux と procfs を必須とする。Gate 3 の entrypoint は開始前に次の環境変数を絶対 path で設定する。

- `SINCRO_GATE3_GO_BINARY`
- `SINCRO_GATE3_NODE_BINARY`
- `SINCRO_GATE3_CHROMIUM_BINARY`
- `SINCRO_GATE3_CONSUL_BINARY`
- `SINCRO_GATE3_FFMPEG_BINARY`

`harnessenv.Load` は実行権限と version を全件検査する。Go は `go.mod` の major/minor、
Node.js は18以上、Chromium、Consul、FFmpeg は成功した version probe の空でない先頭行を要求する。
rootの `node_modules/@playwright/test/cli.js` は通常fileであることをversion probeより先に検査し、
共有package cacheへのsymlink解決を許可する。ブラウザー試験は検査済みの解決先pathをNode.jsへ渡す。
検証途中で暗黙の `PATH` 探索は行わず、Pion の build と Go test 再実行には
`SINCRO_GATE3_GO_BINARY` から検査した同じ path を使う。

repository root は module root から `../..`、Frontend は
`<repository>/sincromisor-frontend/dist`、音声は
`<module>/internal/gate3/testdata/gate3-input.wav` に固定する。repository 所有入力の symlink が
repository 外へ解決される場合は開始しない。

## Frontend ブラウザー試験

repository root で `npm run gate` を実行して Frontend を build した後、module root で次を実行する。

```sh
go test -tags=gate3 ./internal/gate3/browser -run '^TestFrontendBrowserHarness$' -count=1 -v
```

上記の5環境変数に加え、rootの `@playwright/test` 1.54.2、build済み
`sincromisor-frontend/dist`、固定音声 `internal/gate3/testdata/gate3-input.wav` が必要である。

Go 試験が4契約service、Consul、Pion、Playwrightの順に起動し、逆順に停止・joinする。
Pion の same-origin static/API 配信を使うため、別のproxyは起動しない。Chromiumは
`--use-file-for-fake-audio-capture` で固定音声をmicrophone入力に使う。

Playwrightの初期化scriptは最初の実 `RTCPeerConnection` だけをclosureに捕捉し、一時的な
`iceConnectionState=failed` eventを発火する。`restartIce()`、`createOffer()`、signaling `fetch()` を
試験から呼ばず、productionのrestart経路を使う。

合否はPlaywrightが観測するinitial/update Offerとcandidateの実HTTP request、実DataChannelの
message event、native ICE復帰状態、Web Audioの非無音sampleと、Go側の
`pipelinecontract.Transcript()` が示す2正常turnの両方で判定する。

Pion readiness後かつPlaywright起動前に`resources.Sampler`が3 sampleのbaselineを取得する。
Playwright終了後もPionを生存させ、active sessionと4 queueが0、fdとsocketがbaseline+2以下の
sampleが3回連続するまで最大10秒待ってから、Pion以下を逆順に停止する。

## 子 process

`process.Owner` は `new → running → exited` の単調状態を持ち、stdout と stderr の末尾を
各1 MiBまで保存する。`Wait` の context 期限は待機 caller だけを終了させる。
`Close` は SIGTERM の1秒後も running なら SIGKILL を送り、background waiter を join するため、
終了時に子 process を残さない。

## 下流 pipeline 契約と障害注入

`pipelinecontract` は、repository の MessagePack 固定データを schema の正本として
SpeechExtractor、SpeechRecognizer、TextProcessor、VoiceSynthesizer の4契約 service を起動する。
固定入力PCMの発話境界ごとの `speech_id` / `sequence_id`、session、確定済み履歴を service 間で照合し、
TextProcessor の response bytes が VoiceSynthesizer まで変更されていないことを台帳へ記録する。

`wsproxy` は通常は4接続を透過し、正常 turn の完了後に `close`、`malformed`、`held-close` の
有限規則列を arm する。規則は指定 service の最初の request / response 交換だけで先頭から消費され、
次の WebSocket upgrade を1回だけ503で拒否する。request 処理中、未消費規則がある状態、空の規則列では
arm できず、scenario 終了時の未消費状態も error になる。

`consuldev` は `127.0.0.1:8500` が未使用であることを先に確認し、専用 `consul agent -dev` を所有する。
proxy だけを4つの固定 service IDで登録し、終了時は逆順の登録解除後に child process と waiter を join する。
既存 Consul がある場合は変更せず開始を拒否する。

これらの契約 service は、障害語彙、generation reset、台帳、metric 観測を決定的に自己検証するための
通信互換 double である。実 Python service を通した観測ではないため、これだけを Gate 3 合格証拠にはしない。

## 資源採取と収束

`resources.Sampler` は250ms間隔で対象 PID の fd 数と重複なし socket inode、
`/metrics` の active session と `input`、`speech`、`text`、`telop` queue、
`/api/v1/RTCSignalingServer/statuses` を採取する。queue series の欠落は0とし、
いずれかの境界で失敗した回は sample へ追加せず診断として保存する。

基準値は readiness 後かつ session 開始前の3 sampleの最大値である。session 終了後10秒以内に、
active session と4 queueが0、fd と socket が基準値+2以下の sample が3回連続した時だけ収束する。
対象 PID が test process と同じ同一 process modeでは、さらに goroutine が基準値+5以下であることを
要求する。子 process modeでは `goroutines` を `null` のままにする。

## 成果物

`report.Writer` は次の version 1 schema を検証する。

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

`PASS` は `failure_class=NONE`、`FAIL` と `NOT_OBSERVED` は非 `NONE` を要求する。
cleanup は scenario 判定と独立し、`PASS` なら `error=null`、`FAIL` なら空でない error を要求する。
公開時は同じ directory の0600一時 fileを fsync し、hard linkで既存 targetを上書きせず公開した後、
一時 fileを削除して directoryを fsyncする。
