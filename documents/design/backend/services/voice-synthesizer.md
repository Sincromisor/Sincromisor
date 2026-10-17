# バックエンドサービス: VoiceSynthesizer

## 要約

- VoiceSynthesizerはTextProcessorの応答テキストを音声フレームへ変換する下流サービスである。
- 出力音声はGoパイプライン調停器とPion RTCを通じてWebRTC音声トラックでフロントへ返る。
- WebSocket / msgpack契約は `contracts/audio-pipeline-websocket.md`を正本とする。

## 合成エンジン

ComposeはVOICEVOX ENGINE 0.25.2のLinux CPU/x64配布物を使う。
Dockerビルドでは配布物の取得成功後にキャッシュを確定し、HTTPエラーや中断後の一時ファイルは再利用しない。
既存のスタイルID、音声クエリ、WAV、口形同期用モーラ情報の契約を維持する。

## 対象範囲

- 対象
    - VoiceSynthesizerサービス境界
    - 応答テキストから音声フレームへの変換
    - Goパイプライン調停器への結果返却
- 非対象
    - フロント側再生UI
    - TextProcessorの応答生成

## 責務

- TextProcessorの出力を受け取る。
- 音声合成バックエンドを呼び出す。
- `VoiceSynthesizerResult`としてGoパイプライン調停器へ返す。

## 運用ログ

共通JSONLを使い、`SINCRO_LOG_SYNTHESIS_ENABLED`（既定`true`）で本文と生成条件の詳細を切り替える。
生成・Redis・S3の取得元と要求・結果を区別し、WebSocketで保持する会話・発話・シーケンスIDを記録する。
この設定が無効でも、本文を含めずに成功・失敗を記録する。HTTP失敗は状態コードだけを保持し、URLや例外値は記録しない。
キャッシュ保存・返却音声・MessagePack契約は設定に依存しない。
VOICEVOXの中央ログの除去とDocker原本の扱いは[ログ設計](../../infrastructure/logging.md#音声生成)を参照する。

## 変更時の確認

- 音声フレームモデルを変える場合はGoパイプライン調停器とWebSocket契約を同時に更新する。
- 音声合成の提供元や設定を変える場合はDocker Compose環境変数と機密情報の取り扱いを確認する。
- テロップ / 口形同期との関係を変える場合はフロントエンドのキャラクター動作とRTC契約を確認する。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/backend/services/text-processor.md`
- `documents/design/archive/legacy-flat/backend_voice_synthesizer.md`

本文ログ設定によらず、`synthesis_processing`は開始と取得元付きの結果・`duration_ms`を残す。`synthesis_operation`はクエリ作成（`audio_query`）、WAV生成と時刻整形（`synthesis`）、音声変換（`encode`）の結果・所要時間・安全な原因を記録する。

`voice_cache_operation`は読取（復号込み）または書込全体の`duration_ms`を持つ。Redis/S3の読取・復号・書込を区別し、キー不存在と権限拒否・接続失敗・破損を分ける。会話・発話IDを付け、キー・本文・音声・例外文字列は記録しない。S3読取の生成への代替、保存失敗時の継続、破損キャッシュの例外伝播は従来どおりとする。opusenc/fdkaacの非ゼロ終了・起動不能は共有 `audio_command_failure`で記録する。診断はstderrの先頭64 KiBを固定語彙へ置換し、原文を出さない。コマンドの実行回数や既存の出力取得方法は変えない。

## HTTP接続の所有と待機上限

接続ごとのVoiceVoxがRequestsのSessionを所有し、連続要求で接続プールを再利用する。APIごとの応答はその場で解放し、WebSocket終了時にWorker、VoiceCacheManager、VoiceSynthesizerの順で終了を伝えてSessionを閉じる。Sessionは他のクライアント生成が成功した後、初期化の最後に作る。

HTTPは接続5秒・読取り30秒とし、自動再試行は行わない。HTTP非成功は本文・URLを含めないProtocolErrorで伝え、タイムアウトは既存の生成失敗経路へ伝播する。

## 同期処理と接続終了

Workerは一要求ごとに `get_voice`（Redis、S3、VOICEVOX、音声変換）を `asyncio.to_thread` へ渡し、完了を待ってから発話IDを付け替えてWebSocketへ返す。送受信とID操作はイベントループが所有し、次要求の先読みはしない。親取消は同期処理を止めないため、取消が重なっても実行終了を待ち、結果を送らず取消を伝える。接続切断は次のWebSocket入出力で検出する。

ProcessはWorkerの終了後にcloseを呼び、合成用Session、S3、Redisを逆順に解放する。構築途中で失敗した場合も取得済みクライアントを閉じる。Redisは接続5秒・読取30秒で再試行なしとし、無期限待機を除く。S3は採用botocoreの既存既定（接続・読取60秒、legacyモードの有限再試行）を維持する。外部音声変換は共有 `encode_audio` の30秒制限で停止・回収する。これらは処理全体の一律期限ではなく、各I/Oの待機制限である。
