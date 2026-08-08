# Gate 3実行結果

## 判定

`gate_3_result: FAIL`

resource収束検査を接続した最終有効測定ではproduction candidate起動後にinitial Offerを処理したが、
revision 1のcandidate受理を30秒以内に観測できずbrowser scenarioがFAILした。必須commandの製品経路で
FAILしたためGate 3はFAILとし、再実行しない。

## 試行履歴

### 初回試行（無効）

- 対象commit: `00b61272605cbaf557572f8f0d4c2b7a8d67d489`
- worktree: `/tmp/eval-00b61272605c-hWclip`
- root `@playwright/test`: 未配置
- 停止位置: 4契約service起動後、Consul起動前
- 停止理由: `127.0.0.1:8500`の競合
- 扱い: production candidate開始前の環境停止であり、Gate測定へ数えない

### attempt 2の縦切り確認（Gate判定外）

Playwright CLIを配置し、Compose Consulを一時停止してhost network namespaceの`127.0.0.1:8500`が
未使用であることを確認した。resource sampler接続前のbrowser commandは2026-08-09 00:28:53頃から
00:29:50 JSTまで実行し、`TestFrontendBrowserHarness`が56.93秒でPASSした。この結果は接続、2 turn、
ICE restart、DataChannel、非無音音声、cleanupの縦切り証拠として残すが、数値的resource収束を含まないため
最終Gate判定には使わない。

### attempt 2のresource有効測定

- 対象commit: `254f840191593ee0a0b3effd654cf52abe9191ae`
- 測定時harness: working tree上の未commit差分。本artifactを含む後続implementation commitが
  測定時と同一のPlaywright CLI検査、PID accessor、resource sampler接続を固定する
- worktree: `/tmp/eval-8a6060f54766-BIVmUQ`
- 実行日時: 2026-08-09 00:37 JST
- OS: Linux 6.18.33.2-microsoft-standard-WSL2 x86_64
- Go: `/usr/bin/go`、Go 1.26.5、SHA-256
  `58e210a747a7223aaeffc5b3daff1e41786d872f15a74ebb3a12120201926fb3`
- Node.js: `/home/gloria/.nvm/versions/node/v24.18.1/bin/node`、v24.18.1、SHA-256
  `f3432a45b03b2da0d270095fdd8813dc34cbea73f5fc8b18c7a384b7cf9b333a`
- Chromium: `/usr/bin/google-chrome`、Google Chrome 151.0.7922.108、SHA-256
  `aea09d69ce7f24d5901f6bfb15dd44d0c856e793e0a498f8d8393ec7d2c308ec`
- Consul: `/tmp/sincro-gate3-tools/consul`、Consul v2.0.2、SHA-256
  `658ccc24a27dbf5a3a32bf0e2f82baa48d0f290feeb96cfa5c5075dfb2f91370`
- FFmpeg: `/usr/bin/ffmpeg`、6.1.1-3ubuntu5、SHA-256
  `ed16af623947494a72e284b6eb8ff225f2da22b38b5d5069c2fd4b4ba3384e41`
- Playwright: root `@playwright/test` 1.54.2、検査済みCLI
  `/home/gloria/projects/Sincromisor/node_modules/@playwright/test/cli.js`、SHA-256
  `79e23e6a249176295b8490567daa7717448a75866d6ea6f6b296ff3d23305c69`

worktreeのroot `node_modules`はrepository外の共有cacheを指すsymlinkである。`harnessenv.Load`は
Playwright CLIをrepository所有fileとは扱わず、解決先が通常fileであることを外部process起動前に検査した。

## 固定入力

- Frontend `dist`: `npm run gate`で対象commitから生成。全fileのSHA-256列を再度SHA-256へ集約した値は
  `c24ec20cd6e7b2aa2862333262417756010d39f596315a5844e54f71cede7f2c`
- 固定WAV: `internal/gate3/testdata/gate3-input.wav`
- WAV: 16 kHz、mono、16-bit PCM、4.714688秒、SHA-256
  `810d6cabbfcf7963d1a3e4342af57e6046258cfbca65f8e2bc61a8cd84bdf0d4`

## 実行commandと結果

repository rootの`npm run gate`と`npm run tasks:check`、module rootのfocused test、tagなしtest / vet、
代表lifecycle test、Frontendの`npm run check`はPASSした。通常のnetwork権限を必要とするGo testは、
sandbox内の`socket: operation not permitted`を結果へ数えず、許可付きで再実行してPASSした。

```sh
npm run gate
npm run tasks:check

/usr/bin/go test ./internal/gate3/harnessenv -count=1
/usr/bin/go test ./internal/gate3/process ./internal/gate3/resources -count=1
/usr/bin/go test ./...
/usr/bin/go vet ./...
/usr/bin/go test ./internal/rtc \
  -run '^TestSessionMediaReadinessDeadlineClosesWithoutPipeline$' -count=1 -v
/usr/bin/go test ./cmd/pion-poc \
  -run '^TestProcessSIGTERMStopsHTTPAndJoinsActiveSession$' -count=1 -v

cd sincromisor-frontend
npm run check
```

Composeの`sincromisor-sincro-consul-server-1`を一時停止し、固定commandと同じhost network namespaceの
`curl`が`127.0.0.1:8500`へ接続不能でexit 7となることを確認した。resource収束検査を接続した後、
今回の最終有効測定として次を1回だけ実行した。

```sh
SINCRO_GATE3_GO_BINARY=/usr/bin/go \
SINCRO_GATE3_NODE_BINARY=/home/gloria/.nvm/versions/node/v24.18.1/bin/node \
SINCRO_GATE3_CHROMIUM_BINARY=/usr/bin/google-chrome \
SINCRO_GATE3_CONSUL_BINARY=/tmp/sincro-gate3-tools/consul \
SINCRO_GATE3_FFMPEG_BINARY=/usr/bin/ffmpeg \
/usr/bin/go test -tags=gate3 ./internal/gate3/browser \
  -run '^TestFrontendBrowserHarness$' -count=1 -v
```

`TestFrontendBrowserHarness`は41.81秒でFAILした。initial Offerはrevision 1で応答されsession IDも得たが、
Playwrightが`acceptedCandidateRevisions.includes(1)`を30秒以内に観測できなかった。PionはICE checking後、
`pre_connect_timeout`でsessionを閉じ、session registryを0へ戻した。PCM frameは0、pipeline transcriptは空だった。

## resource観測とcleanup

Pion readiness後かつbrowser session開始前のbaselineは`FDCount=8`、`Socket=2`、
`Goroutines=null`だった。3 sampleはすべて`Ready=true`、`Draining=false`、active sessionと4 queueが0、
FDが8、socket inodeが2だった。

browser scenarioが`runPlaywright`内でFAILしたため、`WaitForConvergence`には到達せず収束sampleは未取得である。
失敗cleanupではPionが`shutdown_complete count=0`でexit 0となり、Consulと4契約serviceにもcleanup failureは
記録されなかった。Playwrightはscenario failureのexit 1である。page snapshotは非公開原本
`work/private-artifacts/task-260802033044-pion-phase-3-production-candidate-gate-3/attempt-2-resource-error-context.md`
へ保存した。

## 未観測と残リスク

最終有効測定ではinitial candidate受理前に接続が閉じたため、会話、DataChannel、合成音声、ICE restart、
2 turn後の数値的resource収束は未観測である。resource sampler接続前の縦切り確認はPASSしており、
再現性のない候補交換失敗かresource baseline取得によるtiming影響かは切り分けられていない。
Gate 3を再測定して全件PASSするまでPhase 4へ進めない。
