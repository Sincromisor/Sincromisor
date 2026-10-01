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

`voice_cache_operation`はRedis/S3の読取・復号・書込を区別し、キー不存在と権限拒否・接続失敗・破損を分ける。会話・発話IDを付け、キー・本文・音声・例外文字列は記録しない。S3読取の生成への代替、保存失敗時の継続、破損キャッシュの例外伝播は従来どおりとする。opusenc/fdkaacの非ゼロ終了・起動不能は共有 `audio_command_failure`で記録する。診断はstderrの先頭64 KiBを固定語彙へ置換し、原文を出さない。コマンドの実行回数や既存の出力取得方法は変えない。
