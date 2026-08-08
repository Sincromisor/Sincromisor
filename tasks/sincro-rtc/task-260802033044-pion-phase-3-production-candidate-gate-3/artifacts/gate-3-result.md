# Gate 3実行結果

## 判定

`gate_3_result: FAIL`

固定browser commandは、`127.0.0.1:8500`の一時的な競合によりConsulを起動できずFAILした。
必須commandにFAILがあるため、repository testがPASSしていてもGate 3をPASSとは扱わない。

## 対象commitと実行環境

- 対象commit: `00b61272605cbaf557572f8f0d4c2b7a8d67d489`
- worktree: `/tmp/eval-00b61272605c-hWclip`
- OS: Linux 6.18.33.2-microsoft-standard-WSL2 x86_64
- Go: `/usr/bin/go`、Go 1.26.5、SHA-256
  `58e210a747a7223aaeffc5b3daff1e41786d872f15a74ebb3a12120201926fb3`
- Node.js: `/home/gloria/.nvm/versions/node/v24.18.1/bin/node`、v24.18.1、SHA-256
  `f3432a45b03b2da0d270095fdd8813dc34cbea73f5fc8b18c7a384b7cf9b333a`
- Chromium: `/usr/bin/google-chrome`、Google Chrome 151.0.7922.108、実体SHA-256
  `87faa533d422ee8c64adb0fcce9274631bfe4ab45fb361db5929a60ab2b416cf`
- Consul: `/tmp/sincro-gate3-tools/consul`、Consul v2.0.2、SHA-256
  `658ccc24a27dbf5a3a32bf0e2f82baa48d0f290feeb96cfa5c5075dfb2f91370`
- FFmpeg: `/usr/bin/ffmpeg`、6.1.1-3ubuntu5、SHA-256
  `ed16af623947494a72e284b6eb8ff225f2da22b38b5d5069c2fd4b4ba3384e41`
- Playwright: `package-lock.json`の固定値は`@playwright/test` 1.54.2。worktreeのroot `node_modules`は
  repository rootへのsymlinkだが、対象packageは未配置

ConsulはPATH上に存在しなかったため、既存ローカルimage
`hashicorp/consul:latest`（image ID `7dcf35d6b268`）の`/bin/consul`をtask専用pathへ抽出した。
抽出用containerは検査後に削除した。

## 固定入力

- Frontend `dist`: `npm run gate`で対象commitから生成。全fileのSHA-256列を再度SHA-256へ集約した値は
  `c24ec20cd6e7b2aa2862333262417756010d39f596315a5844e54f71cede7f2c`
- 固定WAV: `internal/gate3/testdata/gate3-input.wav`
- WAV: 16 kHz、mono、16-bit PCM、4.714688秒、SHA-256
  `810d6cabbfcf7963d1a3e4342af57e6046258cfbca65f8e2bc61a8cd84bdf0d4`

## 実行commandと結果

repository rootで2026-08-08 23:55:35 JSTから23:56:20 JSTまで実行し、PASSした。

```sh
npm run gate
```

module rootで固定browser commandを実行した。sandbox内の起動は既定Go cacheがread-onlyでsetup前に
拒否されたため測定に数えず、同一commandを許可付きで1回測定した。2026-08-08 23:57 JSTから
23:57:24 JSTまで実行し、`TestFrontendBrowserHarness`は0.24秒でFAILした。

```sh
SINCRO_GATE3_GO_BINARY=/usr/bin/go \
SINCRO_GATE3_NODE_BINARY=/home/gloria/.nvm/versions/node/v24.18.1/bin/node \
SINCRO_GATE3_CHROMIUM_BINARY=/usr/bin/google-chrome \
SINCRO_GATE3_CONSUL_BINARY=/tmp/sincro-gate3-tools/consul \
SINCRO_GATE3_FFMPEG_BINARY=/usr/bin/ffmpeg \
/usr/bin/go test -tags=gate3 ./internal/gate3/browser \
  -run '^TestFrontendBrowserHarness$' -count=1 -v
```

失敗は次の環境競合であり、直後には同portへ接続できなかったため一時的な占有だった。

```text
start Consul: consul development port is in use: bind 127.0.0.1:8500:
listen tcp 127.0.0.1:8500: bind: address already in use
```

module rootでtagなしtestを2026-08-08 23:57:46 JSTから23:58:35 JSTまで実行し、全packageがPASSした。

```sh
/usr/bin/go test ./...
```

module rootでtagなしvetを2026-08-08 23:58:35 JSTから23:59:04 JSTまで実行し、PASSした。

```sh
/usr/bin/go vet ./...
```

代表readiness timeoutを2026-08-08 23:59:05 JSTから23:59:18 JSTまで実行し、PASSした。

```sh
/usr/bin/go test ./internal/rtc \
  -run '^TestSessionMediaReadinessDeadlineClosesWithoutPipeline$' -count=1 -v
```

代表SIGTERMを2026-08-08 23:59:18 JSTから23:59:44 JSTまで実行し、PASSした。

```sh
/usr/bin/go test ./cmd/pion-poc \
  -run '^TestProcessSIGTERMStopsHTTPAndJoinsActiveSession$' -count=1 -v
```

Frontend checkを2026-08-08 23:59:54 JSTから2026-08-09 00:00:17 JSTまで実行し、PASSした。

```sh
cd sincromisor-frontend
npm run check
```

repository rootで2026-08-09 00:00:17 JSTに実行し、PASSした。

```sh
npm run tasks:check
```

## 観測結果

- tagなしGo test / vet: PASS
- readiness timeoutによるsession close: PASS
- SIGTERM時のHTTP停止とactive session join: PASS
- Frontend check / build / test: PASS
- browser harnessの入力検査と4契約service起動: 到達
- 対象commitのPion sourceを一時directoryへbuild: 未観測
- initial / update Offer、candidate、同一session内ICE restart: 未観測
- 利用者text、応答text、`telop_ch`、2正常turn: 未観測
- 非無音の合成音声: 未観測
- session終了後のresource収束: 未観測

## 未観測と残リスク

browser harnessがConsul起動前段で終了したため、現行Frontendからproduction candidateへ接続する経路、
会話、DataChannel、音声、ICE restart、resource収束は本測定では証明されていない。
さらにroot `node_modules`へ`@playwright/test`が未配置であり、port競合を解消しても今回の環境では
Playwright起動条件を満たさない。
port競合が一時的であっても固定実行のFAILは取り消さず、再測定で全件PASSするまでPhase 4へ進めない。
