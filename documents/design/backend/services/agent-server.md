# バックエンド: AgentServer

## 要約

`agent-server` はMastra APIとStudio Editorを同じコンテナで提供する。
内部のllama-serverへ直接接続し、指示と会話履歴を単一のローカルlibSQLへ保存する。
現在のTextProcessor入口はDifyのままであり、このサービスの追加だけでは会話先を切り替えない。

## 構成と起動

実装は `sincromisor-server/agent-server/`、配備は `Docker/agent-server/` と `compose/agent-server.yml`。
Mastra CLI 1.29.0、core 1.66.0、Editor 0.14.5、Memory 1.29.0、libSQL 1.22.5をロックし、
`mastra build --studio` の本番成果物をNode 24.18.1で実行する。
StudioのAPI接続先は `MASTRA_AUTO_DETECT_URL=true` によりページと同一オリジンにする。
待受アドレス `0.0.0.0` をブラウザー向けURLとして使わない。

`chat` プロファイルで起動し、llama-serverの死活確認成功を待つ。
内部は `0.0.0.0:4111`、ホスト公開は `127.0.0.1:4111` のみ。
公開フロントから管理画面へ転送しない。設定サンプルの正本は `examples/compose.env`。

- `SINCRO_AGENT_ADMIN_TOKEN`: 管理者トークン。32文字以上を必須とし、既定値を置かない。
- `SINCRO_AGENT_LLM_URL`: `http://llama-server:8080/v1`。
- `SINCRO_AGENT_LLM_MODEL`: `gemma-4-E2B-it`。
- `SINCRO_AGENT_DB_URL`: Compose内で `file:/data/mastra.db` に固定する。

ルート `.env` に上記設定を追加し、トークンは `openssl rand -hex 32` などで作る。
モデル準備は[README](../../../../README.md#gemma-4-e2bを準備する)に従う。

```sh
docker compose --profile chat build agent-server
docker compose --profile chat up -d agent-server
```

死活確認はイメージ内のNodeが認証付き `GET /api/agents` を呼ぶ。
設定不足は秘密値を含まないキー名のエラーで起動を拒否する。
モデル一覧の定期外部取得とMastraのテレメトリーは無効にする。

## 管理者認証とEditor

`http://127.0.0.1:4111` を開き、標準のSign in画面でログインする。
Email欄は形式上有効な例 `admin@example.test`、Password欄は管理者トークンを入力する。
SimpleAuthはEmailを利用者識別に使わず、トークンで管理者を判定する。
ログインCookieとBearer認証でStudioとAPIを共通に保護し、会話ユーザー登録やRBACは追加しない。
資格情報をURL、モデルの指示、ログ、公開検証資料へ入れない。

Agentsから「Sincromisorのキャラクター」を開き、Editorで指示を編集する。
下書きを保存して試験し、Publishで公開する。公開前の変更は通常APIへ反映しない。
コードの標準指示は日本語会話と先頭の表情コード `^N`。Editorの既定動作を使い、公開済み設定があればそれを優先する。
初期化で保存済み指示を上書きしない。エージェントID `sincromisor-character`、モデルと実行設定はコード側に置く。

## 会話履歴

Pythonからの会話は固定resource `sincromisor-local` とthread `sincromisor:${session_id}` を指定する。
毎回新しい発話だけを送り、表示用履歴を再投入しない。
同じthreadでは直近20件を使い、別threadとStudioが作る試験用threadへ混入させない。
working memory、semantic recall、observational memoryは無効で、セッション横断の記憶は作らない。
失敗後はWebSocketを終了し、新セッションで中断threadを再利用しない。

## Pythonから使うHTTP契約

採用版の実HTTPで確認した標準APIを使う（2026-09-15）。
`POST /api/agents/sincromisor-character/stream` に `Authorization: Bearer <管理者トークン>` と
`Content-Type: application/json` を付ける。

```json
{
    "messages": [{ "role": "user", "content": "こんにちは。" }],
    "memory": {
        "resource": "sincromisor-local",
        "thread": "sincromisor:セッションID"
    }
}
```

HTTP 200の `text/event-stream` として、空行区切りの `data: <JSON>` を返す。
本文は `type: text-delta` の `payload.text`。`^` と数字が別イベントになる場合がある。
`step-finish` は途中ステップであり、会話全体の終端ではない。
`finish` の `payload.stepResult.reason` が `stop`、`isContinued` がfalseで、その後に `data: [DONE]` が来た場合だけ成功とする。
`length`、`error`、取消、承認待ち・中断、終端前EOFは成功へ丸めない。
ツール入力・結果・推論・`finish` 内の重複した全文は読み上げない。

秘密情報と非必須項目を除いた実イベント例は
[正常応答](../../../../tasks/backend/task-260915031110-mastra-studio-session-memory/acceptance/normal.sse)と
[上限到達](../../../../tasks/backend/task-260915031110-mastra-studio-session-memory/acceptance/length.sse)、
[LLM接続失敗](../../../../tasks/backend/task-260915031110-mastra-studio-session-memory/acceptance/error.sse)に置く。
構造の例であり、全フィールドのコピーではない。

## 取消と失敗

標準HTTPサーバーが要求のAbortSignalを生成へ渡し、ストリーム読取りも切断時に取り消す。
実Gemmaで生成中のHTTPを切断し、llama-serverの稼働スロットが停止することを確認している。
独自のプロキシや取消用ルートは追加しない。
エージェントとモデル呼出しの `maxRetries` は0、最大ステップは5とし、会話全体を自動再実行しない。
本文生成全体を一律30秒で打ち切らず、呼出元は接続・無受信待ちを管理する。

## 保存領域

専用の `agent-data` ボリュームを `/data` へマウントする。サービスはUID 1000のnodeユーザーで動き、
保存先の権限は700とする。Editorの設定と会話履歴を同じlibSQLに保存し、再作成で維持する。
削除を伴う `down -v` は設定と履歴を失うため、通常の再作成では使わない。
詳細は[保存領域](../../infrastructure/storage.md)を参照する。

## 採用版の制限

libSQLはStudioのフィードバック一覧に未対応で、`/api/observability/feedback` は500を返す。
指示の編集・試験・公開と会話履歴の保存には影響しない。フィードバック管理はこの構成の対象外である。

## 一次資料

2026-09-15に確認した範囲は本番Studio配備、SimpleAuth、コード定義エージェントのEditor上書き、thread内のMemoryである。

- [Studio配備](https://mastra.ai/docs/studio/deployment)
- [Studio認証](https://mastra.ai/docs/studio/auth)
- [Editor](https://mastra.ai/docs/studio/editor)
- [会話履歴](https://mastra.ai/docs/memory/message-history)
