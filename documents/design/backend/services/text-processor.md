# バックエンドサービス: TextProcessor

## 要約

- TextProcessor は認識テキストから応答テキスト、チャットメッセージ、テロップ情報を生成する下流サービスである。
- `talk_mode` によりパスと応答方針が変わる。
- テキスト / テロップの出力はフロントエンド RTC 契約にも影響する。

## 対象範囲

- 対象:
    - TextProcessor サービス境界
    - `chat` / `sincro` モード
    - ChatMessage / テロップ生成との接続点
- 非対象:
    - LLM 提供元の詳細設定
    - 音声合成処理

## 責務

- SpeechRecognizer 結果を受け取る。
- `talk_mode` に応じて応答テキストを生成する。
- `ChatMessage` とテロップ / 音声合成への入力を組み立てる。
- 必要に応じて `expression_code` を抽出し、本文から制御記号を除去する。

## Difyチャットの完了と失敗

- `chat` モードはDifyのSSEを非同期で受け、句読点までの本文を入力順にチャット本文と音声合成入力へ渡す。終端記号のない末尾も `message_end` 後に渡す。
- `message_end` を受けた場合だけ `TextProcessorResult` を確定して履歴へ追加する。HTTP失敗、Difyの`error`、不正なSSE、`message_end` のない接続終了は例外としてWebSocket処理へ伝え、失敗した応答を確定しない。
- WebSocket接続が受信処理と直列応答処理を所有する。切断・送信失敗・取消時は両処理を取り消して終了を待ち、要求処理がSSE生成器とHTTP応答を解放する。応答生成を自動で再試行しない。
- Dify接続と無受信待ちにはそれぞれ30秒の時間切れを設ける。応答全体の生成時間は、本文が届き続ける長時間生成を妨げないよう制限しない。

## インターフェース

- 下流との契約:
    - `documents/design/contracts/audio-pipeline-websocket.md`
- フロントエンドから見える契約:
    - `documents/design/contracts/frontend-rtc.md`

## 変更時の確認

- `ChatMessage` のフィールドを変える場合はフロントエンド RTC 契約と `RTCMessage.ts` を確認する。
- `expression_code` の値域や意味を変える場合はキャラクター動作と UI 表示を確認する。
- `talk_mode` を追加する場合はフロントエンド設定、Goパイプライン調停器のパス、TextProcessor 経路を同時更新する。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/archive/legacy-flat/backend_text_processor.md`
