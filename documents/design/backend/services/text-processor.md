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

## Mastraチャットの完了と失敗

`chat` は `text_processor.mastra_worker.MastraTextProcessorWorker` を使う。`SINCRO_PROCESSOR_MASTRA_URL`、
`SINCRO_PROCESSOR_MASTRA_TOKEN`、`SINCRO_PROCESSOR_MASTRA_AGENT_ID` はComposeからプロセス引数へ渡す。
トークンが空ならchat接続時に失敗するため、Mastraを使わない `sincro` の起動を妨げない。

- [AgentServerのHTTP契約](agent-server.md#pythonから使うhttp契約)に従い、新しい発話だけを固定resource `sincromisor-local` と `sincromisor:${session_id}` threadへ送る。
- `text-delta.payload.text` だけを文単位で配信する。表情コードは共通結果モデルへ委ね、ツール・推論・途中ステップは読み上げない。
- `finish` の理由 `stop`、`isContinued: false`、続く `[DONE]` が揃ってから未完の末尾を渡し、履歴を一度だけ確定する。異常理由・取消・不正入力・途中EOFでは確定しない。
- HTTP接続と無受信待ちは30秒、生成全体の上限と会話の自動再試行は設けない。ツール待ちにも同じ無受信上限が適用されるため、MCP側の待ち上限はこれより短く設定する。
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

## 運用ログ

Poke・Mastraとも共通ワーカーが新規入力、送信済み応答断片、確定結果をJSONLへ記録する。累積履歴は出力しない。`SINCRO_LOG_CONVERSATION_ENABLED=false`では本文イベントを止め、処理時間と成功・失敗・取消を残す。送信失敗と取消は確定扱いせず、Mastraの機能用履歴は変更しない。
書式・例外情報・設定反映は[ログ基盤](../../infrastructure/logging.md#pythonのjsonl出力)を参照する。

## 内部処理の診断

`agent_stream` はHTTP応答、SSEの正常終端、予期しないEOF、リモートエラー/中断、取消、時間切れを区別し、会話IDと処理時間を残す。WebSocket送信の失敗は処理段階 `send` と相手 `rtc` を付ける。URL、認証値、外部応答や例外の自由文は記録しない。失敗の伝播と会話内容の記録切替は維持する。
