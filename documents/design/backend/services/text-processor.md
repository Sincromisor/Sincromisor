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

## Mastra処理担当の直接実行

`text_processor.mastra_worker.MastraTextProcessorWorker` はMastra用の処理担当で、
APIのベースURL、管理者トークン、エージェントIDをコンストラクターへ渡す。
サービス入口の `chat` は切替タスクまでDifyを使う。バックエンド選択用の公開設定は追加しない。

- [AgentServerのHTTP契約](agent-server.md#pythonから使うhttp契約)に従い、新しい発話だけを固定resource `sincromisor-local` と `sincromisor:${session_id}` threadへ送る。
- `text-delta.payload.text` だけを文単位で配信する。表情コードは共通結果モデルへ委ね、ツール・推論・途中ステップは読み上げない。
- `finish` の理由 `stop`、`isContinued: false`、続く `[DONE]` が揃ってから未完の末尾を渡し、履歴を一度だけ確定する。異常理由・取消・不正入力・途中EOFでは確定しない。
- HTTP接続と無受信待ちは現行と同じ30秒、生成全体の上限と会話の自動再試行は設けない。ツール待ちにも同じ無受信上限が適用されるため、MCP側の待ち上限はこれより短く設定する。実MCPの設定・全経路確認はMCP導入と切替タスクで行う。
- 共通のWebSocket接続処理から非同期生成器・HTTP応答を所有する。切断と送信失敗でMastraの取消がllama-serverへ伝わり、生成スロットが停止する。

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
