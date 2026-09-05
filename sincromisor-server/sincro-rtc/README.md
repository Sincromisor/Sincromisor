# Pion RTCサービス

## 概要

- 現行フロントエンドシグナリングスキーマを変更せず、Pion v4 の固定 UDP4 ホスト候補経路を確認する。
- ブラウザ Opus RTP を64 パケットのウィンドウ内で並べ替え、Goだけで実装された `github.com/pion/opus` で48 kHz PCMに復号する。
- ステレオを左右平均でモノラル化し、63-tap windowed-sinc FIRで16 kHzへ再サンプリングして、20 ms /
  640-byte s16le フレームを会話調停処理へ同期投入する。
- 重複、遅延した、欠損、バッファに保持した破棄、DTX、処理工程利用不可をプロセスで共有する不可分操作のカウンターへ分けて記録する。
- Gate 2の合成音声を48 kHz モノラルへ復号し、ブラウザ入力と独立した20 ms 時計でOpus 符号化して返す。
- Gate 2のチャットメッセージを`text_ch`へ、音声サンプル位置に同期したモーラ・テロップを`telop_ch`へ送る。
- 世代変更、キュー容量超過、DataChannel 送信待ちデータ量を上限付きの破棄・終了方針で処理する。
- Consul HTTP エンドポイントを指定した場合は Pion 自身を `RTCSignalingServer` として登録し、下流 Python サービスを同じエンドポイントから解決する。
- 本番 Docker Composeはリポジトリのルートの`compose/sincro-rtc.yml`を正本とする。

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
| [`internal/observability`](internal/observability)                               | プロセス固有のPrometheus 登録簿と、種類数を固定した表示名語彙                                                                                             |
| [`internal/gate3`](internal/gate3)                                               | 公開境界から実プロセス、Consul、下流固定サービス、ブラウザーを検証するGate 3試験基盤                                                                      |

代表的な処理は次の順に読む。

1. 起動と終了は[`cmd/sincro-rtc`](cmd/sincro-rtc)から[`internal/config`](internal/config)へ進む。
2. HTTP契約は[`internal/signaling`](internal/signaling)から[フロントエンドのRTC契約](../../documents/design/contracts/frontend-rtc.md)を参照する。
3. PeerConnectionの所有権は[`internal/rtc`](internal/rtc)から`datachannel`、`network`、`media`の順に追う。
4. 会話処理は[`internal/pipeline`](internal/pipeline)から`client`、`discovery`、`protocol`へ進み、通信上の形式は[音声パイプラインWebSocket契約](../../documents/design/contracts/audio-pipeline-websocket.md)を正本とする。
5. 全体の責務境界と試験配置は[sincro-rtcサービス設計](../../documents/design/backend/services/sincro-rtc.md)を参照する。

## ビルド要件

通常ビルドは `CGO_ENABLED=1` と Cコンパイラを必要とする。`mediadevices` v0.10.0 に同梱された
静的なlibopusアーカイブを使うため、`dynamic` ビルドタグやシステムのlibopusは使わない。

対応実行環境の C ツールチェーンが利用できることを確認する。

```sh
cd sincromisor-server/sincro-rtc
CGO_ENABLED=1 go build ./cmd/sincro-rtc
```

合成音声のコンテナ復号にはFFmpeg 6.1以上8.x以下を使う。PATH上の`ffmpeg`を既定とし、
別の実行ファイルは`--ffmpeg`で指定できる。設定値は起動時に絶対パスへ解決され、
`ffmpeg -version`の起動失敗、バージョン解析失敗、対応範囲外はHTTP 待受処理を開く前の
起動エラーになる。代替処理実行ファイルは探索しない。

Ubuntuでは、次のように導入とバージョンを確認する。

```sh
sudo apt-get install ffmpeg
ffmpeg -version
```

## コンテナイメージ

リポジトリのルートからPion バイナリとフロントエンド静的成果物を同時にビルドする。実行用イメージはルート以外のユーザーで
`/opt/sincromisor/frontend`と`/usr/bin/ffmpeg`を既定値として起動する。後続のDocker Compose サービスは
次の死活確認コマンドで`/health/ready`を監視する。起動時の依存関係検証完了かつ非`draining`時の
HTTP 200だけを成功とする。

```sh
CMD curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
```

```sh
docker build -f Docker/sincro-rtc/Dockerfile -t sincro-rtc:local .
docker run --rm --entrypoint curl sincro-rtc:local --version
docker run --rm -p 8080:8080 sincro-rtc:local
```

別の端末から起動を確認する。

```sh
curl --fail http://127.0.0.1:8080/health/live
curl --fail http://127.0.0.1:8080/health/ready
```

FFmpegを利用できない構成は待受処理を開かず非0で終了する。イメージの起動契約は、例えば次で確認できる。

```sh
docker run --rm --entrypoint /opt/sincromisor/sincro-rtc sincro-rtc:local \
  --frontend-dir /opt/sincromisor/frontend \
  --ffmpeg /missing/ffmpeg
```

VoiceSynthesizerから受け取る`audio/wav`、`audio/aac`、パラメータなしの`audio/ogg`、
唯一のパラメータとして`codecs=opus`を持つ`audio/ogg`を、48 kHz モノラル PCMへ変換する。
MIME パラメータの追加や未知コーデックは起動後の復号エラーとして発話単位で拒否する。

## ローカルChrome動作確認

`127.0.0.1:8080` の競合を避ける。フロントエンドビルドはリポジトリのルートから実行する。

```sh
npm --prefix ./sincromisor-frontend run build
```

次に Go モジュールのルートへ移動する。`--frontend-dir` はモジュールのルートを基準にしたパスであり、存在しない場合は
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

初回シグナリングの本番上限は型付き設定を正本とする。`--max-sessions`は1〜100
（既定 100）、`--offer-cache-capacity`は1〜1000（既定 1000）、
`--offer-cache-ttl`は30秒〜2分（既定 2分）の範囲で、小さい値だけを指定できる。
範囲外の値は待受処理を開く前に起動エラーとなる。

`--media-udp-port` はプロセスが全セッションで共有する UDP4 ソケットのポート、`--public-ipv4` は SDP の
ホスト候補に広告する到達可能な IPv4、`--interface` は候補収集と待受アドレス選択を許可するインターフェースである。
3つは必須であり、`--interface` には非-unspecified IPv4がちょうど1つ割り当てられていなければならない。
IPv6だけのインターフェース、ポート 0・範囲外、無効または存在しないインターフェースは HTTP 待受処理を開く前に拒否する。
`turn:` / `turns:` は `--stun` に指定しても拒否し、ICE-TCP と IPv6 は有効化しない。

Consulを使う場合は `--consul-agent-host` と `--consul-agent-port`、`--service-bind-host` を指定する。HTTP エンドポイントは
ローカルまたは相手側 Consulのエージェント APIを直接指定でき、ホストをまたぐゴシップ用エージェントを必要としない。
後者は起動時に単一IPv4へ解決し、待受処理待受後、`/health/ready` がまだ非readyの状態で
`RTCSignalingServer_<service-bind-host>_<resolved-ip>:<http-port>` として登録する。登録成功後に
readyを公開するため、Consul 確認は `http://<resolved-ip>:<http-port>/health/ready` を10秒間隔、
5秒時間切れ、重大後10分で登録解除する。`--fallback-host` と `--fallback-port` は組で指定し、
Consul未指定時または探索失敗時に4下流サービス共通の既存 Caddy エンドポイントとして使う。

Google Chrome 安定版で
`http://127.0.0.1:8080/simple-vrm/index.html` を開き、マイク権限を許可して会話接続を開始する。

確認点:

1. 診断 Console の ICE 状態が `connected` または `completed` になる。
2. サーバーログの `offer answered` で `count=1` になる。
3. ローカル Consulと下流Python サービスを起動した構成では、SpeechExtractor側で20 ms /
   640-byteの16 kHz モノラル s16le フレームを継続受信できることを確認する。サーバーログに
   `inbound audio processing stopped` が出た場合はRTP 読み取り、Opus 復号、または処理工程送信の
   エラーなので正常な動作確認とは扱わない。入力破棄種別の正確な件数は送受信データをログへ出さない
   `input.CounterObserver` が所有し、`go test ./internal/media/input` の対象試験で確認する。
4. Chrome DevTools で相手側音声トラックを AudioContext `AnalyserNode` へ接続し、入力停止中も
   相手側トラックが継続することと、合成結果が20 ms 実行頻度で再生されることを確認する。
5. 会話後、診断 Consoleの`text_ch`に実チャットメッセージ、`telop_ch`に再生音声と同期したモーラが表示され、
   無効送受信データログが出ないことを確認する。
   `session_id`でPion ログを絞り、`recognizer_result_received`、`processor_request_sent`、
   `processor_result_received`、`synthesizer_result_received`の最後の到達段階を確認する。これらのログと
   Git 成果物には認識・チャット・VoiceText・音声・未加工の送受信データを転載しない。
6. 通常終了を連続10回行い、各回の`session registry updated`が`count=0`を示す。
   プロセス停止時は`sincro-rtc stopped`に`stage=shutdown_complete`と`count=0`が記録されることを確認する。

`Ctrl-C` または `SIGTERM` で停止する。Consul登録済みなら`draining`開始直後に2秒上限で登録解除を並行開始する。終了順序は
`BeginDrain → cleanup並行開始 → 1秒の受付拒否観測窓とcleanupの完了待ち → 独立1秒のHTTP停止`
である。後始末は共通5秒期限でOffer 所有者、セッション登録簿、PeerConnection、コーデック、周期タイマー、
メディア goroutineを終了処理を一度だけ実行する経路から収束させ、シグナル受信からプロセス終了までの上限は6秒とする。

## パイプライン再初期化ログ

対象`session_id`でログを絞り、正常段階の直前に最初に出た`pipeline_reset_requested`から、再初期化で閉じた
下流接続の`service`と有限の`cause`を確認する。認識本文、チャット本文、VoiceText、音声、未加工の送受信データは
ログにもGit 成果物にも転載しない。

## 自動検査

モジュールのルートで実行する。

```sh
gofmt -l .
go vet ./...
go test ./...
go test -race ./...
```

Pion の本番ネットワーク結合テストはループバック UDP ソケットを使用し、2 セッションが同じ固定ポートを
広告・接続した後にソケットが解放されることを確認する。サンドボックス内でソケット待受が禁止される環境では、
同じコマンドをネットワーク名前空間の制限がない実行環境で行う。

## 現在の対象範囲

通常サービスは初回Offer、セッション ID付き更新Offer、候補を
`documents/design/contracts/frontend-rtc.md`の契約に従って処理する。未知 / 閉じたセッションの候補は
HTTP 200と`status:false`を返す。

次は現在の運用範囲外である。

- TURN、IPv6、Firefox
- NACK再送 / PLC
- 通信障害注入、長時間稼働、性能比較
