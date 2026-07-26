# Pion RTC codec PoC

## Summary

- 現行 Frontend signaling schema を変更せず、Pion v4 の local host candidate 経路を確認する。
- browser Opus RTP を pure Go の `github.com/pion/opus` で 48 kHz PCM に decode する。
- 48 kHz mono、1 秒の test tone を `github.com/pion/mediadevices/pkg/codec/opus` で encode し、20 ms ごとに返す。
- `text_ch` / `telop_ch` へ固定 smoke JSON を送信し、session close の resource 回収を確認する。
- production compose、Consul、Caddy、下流 Python service への接続は行わない。

## Build requirements

通常 build は `CGO_ENABLED=1` と C compiler を必要とする。`mediadevices` v0.10.0 に同梱された
static libopus archive を使うため、`dynamic` build tagやsystem libopusは使わない。

対応 platform の C toolchain が利用できることを確認する。

```sh
cd sincromisor-server/sincro-rtc-pion-poc
CGO_ENABLED=1 go build ./cmd/pion-poc
```

## Local Chrome smoke

既存 aiortc 版や compose を停止し、`127.0.0.1:8080` の競合を避ける。Frontend build は repository root から
実行する。

```sh
npm --prefix ./sincromisor-frontend run build
```

次に Go module root へ移動する。`--frontend-dir` は module root を基準にした path であり、存在しない場合は
起動時に失敗する。

```sh
cd sincromisor-server/sincro-rtc-pion-poc
go run ./cmd/pion-poc \
  --http 127.0.0.1:8080 \
  --frontend-dir ../../sincromisor-frontend/dist
```

Google Chrome stable で
`http://127.0.0.1:8080/simple-vrm/index.html` を開き、マイク権限を許可して会話接続を開始する。

確認点:

1. Debug Console の ICE state が `connected` または `completed` になる。
2. server log の `offer answered` で `active_sessions=1` になる。
3. server log の `inbound opus smoke threshold reached` が `packets=100`、`sample_rate=48000`、
   `non_zero_samples>0` を示す。
4. Chrome DevTools で remote audio track を AudioContext `AnalyserNode` へ接続し、1 秒 tone の
   time-domain data が無音値だけでないことを確認する。
5. Debug Console の `text_ch` と `telop_ch` に `DataChannel smoke` の固定 JSON が表示され、
   invalid payload log が出ない。
6. 通常 close を連続 10 回行い、各回の `session registry updated` が `active_sessions=0` を示す。
   process を停止した最後の `pion poc stopped` で `final_goroutines` が起動時の
   `initial_goroutines + 5` 以下であることを確認する。

`Ctrl-C` または `SIGTERM` で停止する。HTTP shutdown 後に session registry、PeerConnection、codec、
ticker、media goroutine を close-once 経路で終了する。

## Automated checks

module root で実行する。

```sh
gofmt -l .
go vet ./...
go test ./...
go test -race ./...
```

Pion の local integration test は loopback UDP socket を使用する。sandbox 内で socket bind が禁止される環境では、
同じ command を network namespace の制限がない実行環境で行う。

## PoC boundaries

PoC は initial Offer と local host candidate だけを対象とする。session ID 付き update Offer は 501、
unknown / closed session の candidate は HTTP 200 と `status:false` を返す。

次は後続 phase の責務である。

- 16 kHz mono resampleと下流 Python service接続
- ICE restart、`offer_request_id`、`offer_revision`
- fixed UDP mux、NAT / firewall、TURN、Firefox
- RTP reorder、NACK / PLC、RTCP metrics
- impairment、soak、performance comparison、production compose
