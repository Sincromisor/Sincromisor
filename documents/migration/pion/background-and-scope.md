# 背景と移行方針

## Summary

- 現行 `sincro-rtc` は signaling、WebRTC protocol、codec frame、AudioBroker lifecycleを1つのPython session processで扱う。
- aiortcの保守状況だけでなく、Python runtimeとmedia lifecycleの密結合が性能・資源回収の調査を難しくしている。
- 目標構成ではRTC transportとAudioBroker相当のsession orchestrationをGoへ移し、Pythonには推論・音声生成serviceを残す。
- 移行時は既存MessagePack契約を維持し、型生成や下流protocol刷新を別initiativeへ分離して変更原因を絞る。

## 背景

現行構成では、1 sessionごとに `RTCSessionProcess` を起動し、aiortcの `RTCPeerConnection` と `VoiceTransformTrack` を所有する。`VoiceTransformTrack` は受信音声を16 kHz mono PCMへ変換してAudioBrokerへ渡し、合成音声、`text_ch`、`telop_ch` を同じtrackのpull loopから返す。

この構成には次の問題がある。

- WebRTC protocolとapplication pipelineの失敗範囲が一致している。
- trackを継続消費しない場合の詰まりや、終了時のcallback / task / socket解放をPython側で管理する必要がある。
- PyAV、FFmpeg、NumPy、multiprocessing、thread、WebSocketが同一session lifecycleへ参加する。
- session終了後のRSS増加がPython heap、native heap、codec buffer、socket bufferのどこにあるか切り分けにくい。
- 1 session 1 processは障害分離に寄与する一方、session数に比例してprocessとmemory overheadが増える。

現行仕様は次を正本とする。

- [Frontend RTC契約](../../design/contracts/frontend-rtc.md)
- [Audio Pipeline WebSocket契約](../../design/contracts/audio-pipeline-websocket.md)
- [sincro-rtcサービス設計](../../design/backend/services/sincro-rtc.md)
- [AudioBrokerサービス設計](../../design/backend/services/audio-broker.md)

## 移行原則

### 境界を先に固定する

実装言語を先に広げず、frontend、Go RTC server、Python下流serviceの責務境界を固定する。初期移行では手書きschema、限定DTO、cross-language fixtureを正本とし、型生成基盤の導入は移行完了条件にしない。

### transportとapplication payloadを分離する

Go RTC serverはWebRTC transportに加え、会話pipelineを調停するために次を理解する。

- session lifecycle
- signaling
- audio formatとsequence
- DataChannelのlabel
- transport error
- 下流serviceのrequest / response envelope
- sessionごとのqueue、pipeline一括reset、timeout

Goがroutingや音声同期に必要な `speech_id`、timestamp、audio formatは型付けする。一方、frontendへ渡すチャット本文、表情、telop、moraなどのapplication payloadは可能な範囲でopaque JSONとして中継し、3言語での重複modelを抑える。

### 段階的に置き換える

aiortcとPionは開発・評価環境で個別に検証するが、運用環境では同時稼働させない。PoCと統合評価の完了後、メンテナンス時間にaiortcを停止してPionへ切り替える。rollbackもPion停止後にaiortcを再起動する停止切替とし、active sessionの継続は保証しない。

### 計測できない改善を完了扱いにしない

性能とmemory leak回避を目的に含むため、RSSだけでなくheap、goroutine、thread、file descriptor、socket、queue、latencyを移行前後で比較する。

## スコープ

### 対象

- HTTP signaling endpoint
- Pion `PeerConnection` とsession registry
- Trickle ICE、STUN、同一session IDのICE restart
- Opus RTPの受信、decode、resample
- 合成PCMのresample、Opus encode、RTP送信
- `text_ch` / `telop_ch`
- Goから下流Python serviceへ接続するpipeline client
- 既存MessagePack契約のGo互換実装と双方向golden fixture
- compose、Consul、metrics、health check
- 旧経路との切り替えとrollback

### 非対象

- SpeechExtractor、SpeechRecognizer、TextProcessor、VoiceSynthesizerの内部実装変更
- frontendの画面、VRM、会話UIの再設計
- LiveKitやmediasoupによるroom / SFU architectureへの全面移行
- video trackのserver-side処理
- 複数参加者会話
- TURN relay、IPv6、複数Pion instance
- Pipeline Protocol Buffers移行、OpenAPI client / server生成
- aiortcとPionの運用環境での同時稼働、active sessionの移送

## 成功条件

- ChromeとFirefoxから現行endpoint / payloadで接続できる。
- 固定UDP mux portによる直接接続、Trickle ICE、同一session IDのICE restartがtest matrixを満たす。
- 入力音声が既存pipelineの16 kHz mono PCM契約を満たす。
- 合成音声と `text_ch` の順序・内容、およびunordered / unreliableな `telop_ch` の内容が現行動作と一致する。
- 連続接続・切断後に資源数が許容範囲へ戻る。
- 初期統合ではaiortc経路を停止しても既存Python下流serviceを変更せず運用できる。
- 最終構成にPython RTC adapterやPython AudioBroker serviceが残らない。
