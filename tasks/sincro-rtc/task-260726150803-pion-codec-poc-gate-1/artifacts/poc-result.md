# Pion codec PoC result

## 判定

**PASS**

現行Frontendを無変更でGoogle Chrome stableからPionへ接続し、接続、inbound decode、
outbound encode / playback、2 DataChannel、10回closeの全判定項目が成立した。
このPASSはPionを後続実装の出発点にする判断であり、production品質の証明ではない。

## 環境

- 実施日: 2026-07-26
- OS: macOS 26.5.2 / Darwin 25.5.0 arm64
- Browser: Google Chrome 150.0.7871.184 stable
- Go: 1.26.5 darwin/arm64
- Frontend / PoC: 同一implementation worktree
- network: `127.0.0.1:8080` same-origin配信、local host candidate

## 実行経路

repository rootで現行Frontendをbuildした。

```sh
npm --prefix ./sincromisor-frontend run build
```

Go module rootへ移動し、taskで固定された相対pathからstatic配信した。

```sh
cd sincromisor-server/sincro-rtc-pion-poc
go run ./cmd/pion-poc \
  --http 127.0.0.1:8080 \
  --frontend-dir ../../sincromisor-frontend/dist
```

Chromeで `http://127.0.0.1:8080/simple-vrm/index.html` を開き、microphone / camera権限を付与した。
camera用MediaPipe assetの404はCharacterGazeを停止したが、RTC audio track取得と本PoCの判定項目には影響しなかった。

## 観測結果

| 境界                | 結果 | 観測                                                                               |
| ------------------- | ---- | ---------------------------------------------------------------------------------- |
| signaling / ICE     | PASS | server logで `state=connected`、`active_sessions=1`                                |
| inbound Opus decode | PASS | `packets=100 sample_rate=48000 channels=2 non_zero_samples=164174`                 |
| outbound encode     | PASS | 50個の20 ms frameを送信し、`outbound test tone completed duration_ms=1000`         |
| Chrome playback     | PASS | remote MediaStreamへ接続したAudioContext analyzerで `maxDeviation=33`（無音なら0） |
| `text_ch`           | PASS | 固定JSONをtext messageで受信し、画面に `DataChannel smoke` を表示                  |
| `telop_ch`          | PASS | 固定JSONをtext messageで受信し、画面に `DataChannel smoke` を表示                  |
| DataChannel parser  | PASS | 最終runでinvalid payload warningなし                                               |
| 10回close           | PASS | 10/10で接続と固定payload受信後に通常reload close、各回 `active_sessions=0`         |
| process shutdown    | PASS | `initial_goroutines=3`、`final_goroutines=8`、差分+5、最終 `active_sessions=0`     |

10回closeは各attemptで `state=connected` と両channelの `data channel smoke sent` を確認してからpage reloadし、
server logの `state=closed`、`session registry updated active_sessions=0` への収束を確認した。

## 自動検証

- config、Offer / candidate validation、501 update Offer、unknown / closed candidateの200 + `status:false`
- candidate gathering timeoutの504
- 48 kHz mono / 1秒 / non-silent PCM生成
- 20 ms x 50 frameのOpus encodeとpure Go decode
- Pion local pairで両DataChannel固定payload、close-once、10回close、SIGTERM相当CloseAll
- `gofmt`、`go vet`、通常test、race test、repository gate / task check

最終command結果は `impl.md` に記録する。

## 実browserで見つけた問題と修正

1. STUN未指定時の `iceServers:null` をFrontend Zod schemaが拒否したため、常にJSON arrayとして返すよう修正した。
2. `DataChannel.Send([]byte)` はChromeでArrayBufferになったため、`SendText`でUTF-8 JSON textを送るよう修正した。
3. ChromeのOpus DTX中に空RTP payloadが届いたため、音声frameとしてdecodeせず次のpacketを待つよう修正した。

いずれも修正後の同じChrome smokeで再確認した。

## 後続phase

以下はPASS判定に含めず、移行文書どおりPhase 2から4で実装・検証する。

- 16 kHz mono resample、下流Python service、VoiceSynthesizer形式
- `offer_request_id`、`offer_revision`、ICE restart
- fixed UDP mux、Docker、NAT / firewall、TURN、IPv6
- Firefox、impairment、NACK / PLC、RTCP metrics
- 30分soak、100回stress、CPU / memory / latencyのaiortc比較
