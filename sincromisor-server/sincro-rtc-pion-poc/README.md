# Pion RTC codec PoC

## Summary

- 現行 Frontend signaling schema を変更せず、Pion v4 の固定 UDP4 host candidate 経路を確認する。
- browser Opus RTP を64 packetのwindow内で並べ替え、pure Go の `github.com/pion/opus` で48 kHz PCMにdecodeする。
- stereoを左右平均でmono化し、63-tap windowed-sinc FIRで16 kHzへresampleして、20 ms /
  640-byte s16le frameをConversation Coordinatorへ同期投入する。
- duplicate、late、missing、buffered drop、DTX、pipeline unavailableをprocess共有atomic counterへ分けて記録する。
- Gate 2の合成音声を48 kHz monoへdecodeし、browser入力と独立した20 ms clockでOpus encodeして返す。
- Gate 2のchat messageを`text_ch`へ、audio sample位置に同期したmora/telopを`telop_ch`へ送る。
- generation変更、queue overflow、DataChannel buffered amountをboundedなdrop/close policyで処理する。
- Consul agent を指定した場合は Pion 自身を `RTCSignalingServer` として登録し、下流 Python service を同じ agent から解決する。
- production compose、Caddy への組み込みは行わない。

## Build requirements

通常 build は `CGO_ENABLED=1` と C compiler を必要とする。`mediadevices` v0.10.0 に同梱された
static libopus archive を使うため、`dynamic` build tagやsystem libopusは使わない。

対応 platform の C toolchain が利用できることを確認する。

```sh
cd sincromisor-server/sincro-rtc-pion-poc
CGO_ENABLED=1 go build ./cmd/pion-poc
```

合成音声のcontainer decodeにはFFmpeg 6.1以上8.x以下を使う。PATH上の`ffmpeg`を既定とし、
別のexecutableは`--ffmpeg`で指定できる。設定値は起動時にabsolute pathへ解決され、
`ffmpeg -version`の起動失敗、version解析失敗、対応範囲外はHTTP listenerを開く前の
startup errorになる。fallback executableは探索しない。

Ubuntuでは、次のように導入とversionを確認する。

```sh
sudo apt-get install ffmpeg
ffmpeg -version
```

## Container image

repository rootからPion binaryとFrontend静的成果物を同時にbuildする。実行imageはnon-root userで
`/opt/sincromisor/frontend`と`/usr/bin/ffmpeg`を既定値として起動する。

```sh
docker build -f Docker/sincro-rtc-pion-poc/Dockerfile -t sincro-rtc-pion-poc:local .
docker run --rm -p 8080:8080 sincro-rtc-pion-poc:local
```

別terminalから起動を確認する。

```sh
curl --fail http://127.0.0.1:8080/health/live
curl --fail http://127.0.0.1:8080/health/ready
```

FFmpegを利用できない構成はlistenerを開かず非0で終了する。imageのstartup契約は、例えば次で確認できる。

```sh
docker run --rm --entrypoint /opt/sincromisor/pion-poc sincro-rtc-pion-poc:local \
  --frontend-dir /opt/sincromisor/frontend \
  --ffmpeg /missing/ffmpeg
```

VoiceSynthesizerから受け取る`audio/wav`、`audio/aac`、parameterなしの`audio/ogg`、
唯一のparameterとして`codecs=opus`を持つ`audio/ogg`を、48 kHz mono PCMへ変換する。
MIME parameterの追加や未知codecは起動後のdecode errorとして発話単位で拒否する。

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
  --frontend-dir ../../sincromisor-frontend/dist \
	--ffmpeg /usr/bin/ffmpeg \
	--media-udp 192.0.2.10:3478 \
	--public-ipv4 203.0.113.10 \
	--interface eth0 \
	--max-sessions 100 \
  --offer-cache-capacity 1000 \
  --offer-cache-ttl 2m
```

initial signalingのproduction上限はtyped configを正本とする。`--max-sessions`は1〜100
（default 100）、`--offer-cache-capacity`は1〜1000（default 1000）、
`--offer-cache-ttl`は30秒〜2分（default 2分）の範囲で、小さい値だけを指定できる。
範囲外の値はlistenerを開く前にstartup errorとなる。

`--media-udp` は process が全 session で共有する UDP4 socket の bind address、`--public-ipv4` は SDP の
host candidate に広告する到達可能な IPv4、`--interface` は candidate 収集を許可する interface である。
3つは必須であり、`--media-udp` は wildcardでないIPv4かつ指定interfaceへ割当済みでなければならない。
IPv6、port 0、downまたは存在しない interface は HTTP listener を開く前に拒否する。
`turn:` / `turns:` は `--stun` に指定しても拒否し、ICE-TCP と IPv6 は有効化しない。

Consulを使う場合は `--consul-agent-host` と `--consul-agent-port`、`--service-bind-host` を指定する。
後者は起動時に単一IPv4へ解決し、listener bind後、`/health/ready` がまだ非readyの状態で
`RTCSignalingServer_<service-bind-host>_<resolved-ip>:<http-port>` として登録する。登録成功後に
readyを公開するため、Consul checkは `http://<resolved-ip>:<http-port>/health/ready` を10秒間隔、
5秒timeout、critical後10分でderegisterする。`--fallback-host` と `--fallback-port` は組で指定し、
Consul未指定時またはlookup失敗時に4下流service共通の既存 Caddy endpointとして使う。

Google Chrome stable で
`http://127.0.0.1:8080/simple-vrm/index.html` を開き、マイク権限を許可して会話接続を開始する。

確認点:

1. Debug Console の ICE state が `connected` または `completed` になる。
2. server log の `offer answered` で `active_sessions=1` になる。
3. local Consulと下流Python serviceを起動した構成では、SpeechExtractor側で20 ms /
   640-byteの16 kHz mono s16le frameを継続受信できることを確認する。server logに
   `inbound audio processing stopped` が出た場合はRTP read、Opus decode、またはpipeline submitの
   errorなので正常なsmokeとは扱わない。入力drop種別の正確な件数はpayloadをlogへ出さない
   `InputCounterObserver` が所有し、`go test ./internal/media` のfocused testで確認する。
4. Chrome DevTools で remote audio track を AudioContext `AnalyserNode` へ接続し、入力停止中も
   remote trackが継続することと、合成結果が20 ms cadenceで再生されることを確認する。
5. 会話後、Debug Consoleの`text_ch`に実chat message、`telop_ch`に再生audioと同期したmoraが表示され、
   invalid payload logが出ないことを確認する。
6. 通常 close を連続 10 回行い、各回の `session registry updated` が `active_sessions=0` を示す。
   process を停止した最後の `pion poc stopped` で `final_goroutines` が起動時の
   `initial_goroutines + 5` 以下であることを確認する。

`Ctrl-C` または `SIGTERM` で停止する。Consul登録済みならdraining開始直後に2秒上限でderegisterを並行開始する。終了順序は
`BeginDrain → cleanup並行開始 → 1秒の受付拒否観測窓とcleanupの完了待ち → 独立1秒のHTTP停止`
である。cleanupは共通5秒期限でOffer owner、session registry、PeerConnection、codec、ticker、
media goroutineをclose-once経路から収束させ、signal受信からprocess終了までの上限は6秒とする。

## Automated checks

module root で実行する。

```sh
gofmt -l .
go vet ./...
go test ./...
go test -race ./...
```

Pion の production network integration test は loopback UDP socket を使用し、2 session が同じ固定 portを
広告・接続した後にsocketが解放されることを確認する。sandbox 内で socket bind が禁止される環境では、
同じ command を network namespace の制限がない実行環境で行う。

## PoC boundaries

PoC は冪等なinitial Offerとlocal host candidateだけを対象とする。session ID付きupdate Offerは501、
unknown / closed session の candidate は HTTP 200 と `status:false` を返す。

次は後続 phase の責務である。

- ICE restartとrevision 2以降のupdate Offer
- NAT / firewall、TURN、Firefox
- NACK / PLC、RTCP metrics
- impairment、soak、performance comparison、production compose
- container imageとproduction composeへのFFmpeg導入（Phase 4）
