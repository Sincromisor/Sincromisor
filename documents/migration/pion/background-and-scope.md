# 背景と移行方針

## 要約

- 現行 `sincro-rtc` はシグナリング、WebRTC 通信規約、コーデックフレーム、AudioBroker 生存期間を1つのPython セッションプロセスで扱う。
- aiortcの保守状況だけでなく、Python 実行時とメディア生存期間の密結合が性能・資源回収の調査を難しくしている。
- 目標構成ではRTC 転送とAudioBroker相当のセッション処理の組み立てをGoへ移し、Pythonには推論・音声生成サービスを残す。
- 移行時は既存MessagePack契約を維持し、型生成や下流通信規約刷新を別取り組み計画へ分離して変更原因を絞る。

## 背景

現行構成では、1 セッションごとに `RTCSessionProcess` を起動し、aiortcの `RTCPeerConnection` と `VoiceTransformTrack` を所有する。`VoiceTransformTrack` は受信音声を16 kHz モノラル PCMへ変換してAudioBrokerへ渡し、合成音声、`text_ch`、`telop_ch` を同じトラックの取得要求に応じるループから返す。

この構成には次の問題がある。

- WebRTC 通信規約と適用処理工程の失敗範囲が一致している。
- トラックを継続消費しない場合の詰まりや、終了時のコールバック / タスク / ソケット解放をPython側で管理する必要がある。
- PyAV、FFmpeg、NumPy、multiprocessing、スレッド、WebSocketが同一セッションの生存期間へ参加する。
- セッション終了後のRSS増加がPython ヒープ、標準のヒープ、コーデックバッファ、ソケットバッファのどこにあるか切り分けにくい。
- 1セッションにつき1プロセスは障害分離に寄与する一方、セッション数に比例してプロセスとメモリの追加負担が増える。

現行仕様は次を正本とする。

- [フロントエンドのRTC契約](../../design/contracts/frontend-rtc.md)
- [音声パイプラインのWebSocket契約](../../design/contracts/audio-pipeline-websocket.md)
- [sincro-rtcサービス設計](../../design/backend/services/sincro-rtc.md)
- [旧AudioBrokerサービス設計](../../design/archive/legacy-flat/backend_audio_broker.md)

## 移行原則

### 境界を先に固定する

実装言語を先に広げず、フロントエンド、Go RTC サーバー、Python下流サービスの責務境界を固定する。初期移行では手書きスキーマ、限定DTO、言語間の固定データを正本とし、型生成基盤の導入は移行完了条件にしない。

### 転送とアプリケーションの送受信データを分離する

Go RTC サーバーはWebRTC 転送に加え、会話処理工程を調停するために次を理解する。

- セッションの生存期間
- シグナリング
- 音声形式と系列
- DataChannelの表示名
- 転送エラー
- 下流サービスの要求 / 応答包む形式
- セッションごとのキュー、処理工程一括再初期化、時間切れ

Goが経路選択や音声同期に必要な `speech_id`、時刻、音声形式は型付けする。一方、フロントエンドへ渡すチャット本文、表情、テロップ、モーラなどのアプリケーションの送受信データは可能な範囲で内容を解釈しない JSONとして中継し、3言語での重複モデルを抑える。

### 段階的に置き換える

aiortcとPionは開発・評価環境で個別に検証するが、運用環境では同時稼働させない。PoCと統合評価の完了後、メンテナンス時間にaiortcを停止してPionへ切り替える。Pion切替後の障害は現行版の修正で対応し、有効セッションの継続は保証しない。

### 計測できない改善を完了扱いにしない

性能とメモリリーク回避を目的に含むため、RSSだけでなくヒープ、goroutine、スレッド、ファイル記述子、ソケット、キュー、遅延を移行前後で比較する。

## スコープ

### 対象

- HTTP シグナリングエンドポイント
- Pion `PeerConnection` とセッション登録簿
- Trickle ICE、STUN、同一セッション IDのICE 再接続
- Opus RTPの受信、復号、再サンプリング
- 合成PCMの再サンプリング、Opus 符号化、RTP送信
- `text_ch` / `telop_ch`
- Goから下流Python サービスへ接続する処理工程クライアント
- 既存MessagePack契約のGo互換実装と双方向期待結果を固定した検証データ
- Docker Compose、Consul、指標、死活確認
- 旧経路からの切り替えとPion問題時の現行版の修正で対応

### 非対象

- SpeechExtractor、SpeechRecognizer、TextProcessor、VoiceSynthesizerの内部実装変更
- フロントエンドの画面、VRM、会話UIの再設計
- LiveKitやmediasoupによるルーム / SFU アーキテクチャへの全面移行
- 映像トラックのサーバー側の処理
- 複数参加者会話
- TURN 中継、IPv6、複数Pion インスタンス
- パイプラインのProtocol Buffers移行、OpenAPI クライアント / サーバー生成
- aiortcとPionの運用環境での同時稼働、有効セッションの移送

## 成功条件

- 現在対応するブラウザから現行エンドポイント / 送受信データで接続できる。Gate 4はGate 3で成立済みのChrome経路だけを確認し、
  他ブラウザはブラウザ固有の実害があり、aiortcで同じ実環境動作確認が成立している場合だけ独立して確認する。
- 固定UDP mux ポートによる直接接続、Trickle ICE、同一セッション IDのICE 再接続がテスト行列を満たす。
- 入力音声が既存処理工程の16 kHz モノラル PCM契約を満たす。
- 合成音声と `text_ch` の順序・内容、および順序を保証しない / 信頼性を保証しないな `telop_ch` の内容が現行動作と一致する。
- 連続接続・切断後に資源数が許容範囲へ戻る。
- 初期統合ではaiortc経路を停止しても既存Python下流サービスを変更せず運用できる。
- 最終構成にPython RTC アダプターやPython AudioBroker サービスが残らない。
