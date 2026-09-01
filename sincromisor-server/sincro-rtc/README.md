# Pion RTCサービス

## 概要

- 現行 Frontend signaling schema を変更せず、Pion v4 の固定 UDP4 host candidate 経路を確認する。
- browser Opus RTP を64 packetのwindow内で並べ替え、pure Go の `github.com/pion/opus` で48 kHz PCMにdecodeする。
- stereoを左右平均でmono化し、63-tap windowed-sinc FIRで16 kHzへresampleして、20 ms /
  640-byte s16le frameをConversation Coordinatorへ同期投入する。
- duplicate、late、missing、buffered drop、DTX、pipeline unavailableをprocess共有atomic counterへ分けて記録する。
- Gate 2の合成音声を48 kHz monoへdecodeし、browser入力と独立した20 ms clockでOpus encodeして返す。
- Gate 2のchat messageを`text_ch`へ、audio sample位置に同期したmora/telopを`telop_ch`へ送る。
- generation変更、queue overflow、DataChannel buffered amountをboundedなdrop/close policyで処理する。
- Consul HTTP endpoint を指定した場合は Pion 自身を `RTCSignalingServer` として登録し、下流 Python service を同じ endpoint から解決する。
- production composeはrepository rootの`compose/sincro-rtc.yml`を正本とする。

## パッケージ責務図

| 入口・パッケージ                                                                 | 責務                                                                                                                                                      |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`cmd/sincro-rtc`](cmd/sincro-rtc)                                               | 実行入口、起動依存の構築、HTTP提供、シグナル後の終了順序                                                                                                  |
| [`internal/config`](internal/config)                                             | コマンドライン設定の解析と、リスナーを開く前の値・パス検証                                                                                                |
| [`internal/signaling`](internal/signaling) / [`offer`](internal/signaling/offer) | HTTPシグナリングと稼働状態の公開 / Offerの重複排除、候補収集、再利用期限                                                                                  |
| [`internal/rtc`](internal/rtc) / [`datachannel`](internal/rtc/datachannel)       | セッションとPeerConnectionの生存期間 / `text_ch`・`telop_ch`のキューと送信                                                                                |
| [`internal/rtc/network`](internal/rtc/network)                                   | 全セッションで共有するPion API、UDP4ソケット、候補方針                                                                                                    |
| [`internal/media`](internal/media)                                               | [`input`](internal/media/input)の受信音声変換、[`output`](internal/media/output)の送信音声制御、[`synthdecode`](internal/media/synthdecode)の合成音声復号 |
| [`internal/pipeline`](internal/pipeline)                                         | 4つの下流サービスを世代単位で接続し、再初期化、履歴、キューを調停                                                                                         |
| [`internal/observability`](internal/observability)                               | process固有のPrometheus registryと、種類数を固定したlabel語彙                                                                                             |
| [`internal/gate3`](internal/gate3)                                               | 公開境界から実process、Consul、下流固定サービス、ブラウザーを検証するGate 3試験基盤                                                                       |

代表的な処理は次の順に読む。

1. 起動と終了は[`cmd/sincro-rtc`](cmd/sincro-rtc)から[`internal/config`](internal/config)へ進む。
2. HTTP契約は[`internal/signaling`](internal/signaling)から[Frontend RTC契約](../../documents/design/contracts/frontend-rtc.md)を参照する。
3. PeerConnectionの所有権は[`internal/rtc`](internal/rtc)から`datachannel`、`network`、`media`の順に追う。
4. 会話処理は[`internal/pipeline`](internal/pipeline)から`client`、`discovery`、`protocol`へ進み、wire形式は[音声パイプラインWebSocket契約](../../documents/design/contracts/audio-pipeline-websocket.md)を正本とする。
5. 全体の責務境界と試験配置は[sincro-rtcサービス設計](../../documents/design/backend/services/sincro-rtc.md)を参照する。

## ビルド要件

通常 build は `CGO_ENABLED=1` と C compiler を必要とする。`mediadevices` v0.10.0 に同梱された
static libopus archive を使うため、`dynamic` build tagやsystem libopusは使わない。

対応 platform の C toolchain が利用できることを確認する。

```sh
cd sincromisor-server/sincro-rtc
CGO_ENABLED=1 go build ./cmd/sincro-rtc
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

## コンテナイメージ

repository rootからPion binaryとFrontend静的成果物を同時にbuildする。実行imageはnon-root userで
`/opt/sincromisor/frontend`と`/usr/bin/ffmpeg`を既定値として起動する。後続のcompose serviceは
次のhealthcheck commandで`/health/ready`を監視する。startup dependency検証完了かつ非draining時の
HTTP 200だけを成功とする。

```sh
CMD curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
```

```sh
docker build -f Docker/sincro-rtc/Dockerfile -t sincro-rtc:local .
docker run --rm --entrypoint curl sincro-rtc:local --version
docker run --rm -p 8080:8080 sincro-rtc:local
```

別terminalから起動を確認する。

```sh
curl --fail http://127.0.0.1:8080/health/live
curl --fail http://127.0.0.1:8080/health/ready
```

FFmpegを利用できない構成はlistenerを開かず非0で終了する。imageのstartup契約は、例えば次で確認できる。

```sh
docker run --rm --entrypoint /opt/sincromisor/sincro-rtc sincro-rtc:local \
  --frontend-dir /opt/sincromisor/frontend \
  --ffmpeg /missing/ffmpeg
```

VoiceSynthesizerから受け取る`audio/wav`、`audio/aac`、parameterなしの`audio/ogg`、
唯一のparameterとして`codecs=opus`を持つ`audio/ogg`を、48 kHz mono PCMへ変換する。
MIME parameterの追加や未知codecは起動後のdecode errorとして発話単位で拒否する。

## ローカルChrome動作確認

`127.0.0.1:8080` の競合を避ける。Frontend build は repository root から実行する。

```sh
npm --prefix ./sincromisor-frontend run build
```

次に Go module root へ移動する。`--frontend-dir` は module root を基準にした path であり、存在しない場合は
起動時に失敗する。

```sh
cd sincromisor-server/sincro-rtc
go run ./cmd/sincro-rtc \
  --http 127.0.0.1:8080 \
  --frontend-dir ../../sincromisor-frontend/dist \
	--ffmpeg /usr/bin/ffmpeg \
	--media-udp-port 3478 \
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

`--media-udp-port` は process が全 session で共有する UDP4 socket の port、`--public-ipv4` は SDP の
host candidate に広告する到達可能な IPv4、`--interface` は candidate 収集とbind address選択を許可する interfaceである。
3つは必須であり、`--interface` には非-unspecified IPv4がちょうど1つ割り当てられていなければならない。
IPv6だけのinterface、port 0・範囲外、downまたは存在しない interface は HTTP listener を開く前に拒否する。
`turn:` / `turns:` は `--stun` に指定しても拒否し、ICE-TCP と IPv6 は有効化しない。

Consulを使う場合は `--consul-agent-host` と `--consul-agent-port`、`--service-bind-host` を指定する。HTTP endpointは
localまたはremote Consulのagent APIを直接指定でき、cross-host gossip agentを必要としない。
後者は起動時に単一IPv4へ解決し、listener bind後、`/health/ready` がまだ非readyの状態で
`RTCSignalingServer_<service-bind-host>_<resolved-ip>:<http-port>` として登録する。登録成功後に
readyを公開するため、Consul checkは `http://<resolved-ip>:<http-port>/health/ready` を10秒間隔、
5秒timeout、critical後10分でderegisterする。`--fallback-host` と `--fallback-port` は組で指定し、
Consul未指定時またはlookup失敗時に4下流service共通の既存 Caddy endpointとして使う。

Google Chrome stable で
`http://127.0.0.1:8080/simple-vrm/index.html` を開き、マイク権限を許可して会話接続を開始する。

確認点:

1. Debug Console の ICE state が `connected` または `completed` になる。
2. server log の `offer answered` で `count=1` になる。
3. local Consulと下流Python serviceを起動した構成では、SpeechExtractor側で20 ms /
   640-byteの16 kHz mono s16le frameを継続受信できることを確認する。server logに
   `inbound audio processing stopped` が出た場合はRTP read、Opus decode、またはpipeline submitの
   errorなので正常なsmokeとは扱わない。入力drop種別の正確な件数はpayloadをlogへ出さない
   `input.CounterObserver` が所有し、`go test ./internal/media/input` の対象試験で確認する。
4. Chrome DevTools で remote audio track を AudioContext `AnalyserNode` へ接続し、入力停止中も
   remote trackが継続することと、合成結果が20 ms cadenceで再生されることを確認する。
5. 会話後、Debug Consoleの`text_ch`に実chat message、`telop_ch`に再生audioと同期したmoraが表示され、
   invalid payload logが出ないことを確認する。
   `session_id`でPion logを絞り、`recognizer_result_received`、`processor_request_sent`、
   `processor_result_received`、`synthesizer_result_received`の最後の到達stageを確認する。これらのlogと
   Git artifactには認識・chat・VoiceText・音声・Raw payloadを転載しない。
6. 通常closeを連続10回行い、各回の`session registry updated`が`count=0`を示す。
   process停止時は`sincro-rtc stopped`に`stage=shutdown_complete`と`count=0`が記録されることを確認する。

`Ctrl-C` または `SIGTERM` で停止する。Consul登録済みならdraining開始直後に2秒上限でderegisterを並行開始する。終了順序は
`BeginDrain → cleanup並行開始 → 1秒の受付拒否観測窓とcleanupの完了待ち → 独立1秒のHTTP停止`
である。cleanupは共通5秒期限でOffer owner、session registry、PeerConnection、codec、ticker、
media goroutineをclose-once経路から収束させ、signal受信からprocess終了までの上限は6秒とする。

## パイプライン再初期化ログ

対象`session_id`でログを絞り、正常stageの直前に最初に出た`pipeline_reset_requested`から、resetで閉じた
下流connectionの`service`と有限の`cause`を確認する。認識本文、chat本文、VoiceText、音声、Raw payloadは
ログにもGit artifactにも転載しない。

## 自動検査

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

## 現在の対象範囲

通常serviceはinitial Offer、session ID付きupdate Offer、candidateを
`documents/design/contracts/frontend-rtc.md`の契約に従って処理する。unknown / closed session のcandidateは
HTTP 200と`status:false`を返す。

次は現在の運用範囲外である。

- TURN、IPv6、Firefox
- NACK再送 / PLC
- 通信障害注入、長時間稼働、性能比較
