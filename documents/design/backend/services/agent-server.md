# バックエンド: AgentServer

## 要約

`agent-server` はMastra APIとStudio Editorを同じコンテナで提供する。
内部のllama-serverへ直接接続し、指示と会話履歴を単一のローカルlibSQLへ保存する。
TextProcessorのchat入口はこのサービスへ接続し、Mastraのストリームを既存の音声処理契約へ変換する。

## 構成と起動

実装は `sincromisor-server/agent-server/`、配備は `Docker/agent-server/` と `compose/agent-server.yml`。
Mastra CLI 1.29.0、core 1.66.0、Editor 0.14.5、Memory 1.29.0、libSQL 1.22.5、MCPClient 1.17.3をロックし、
`mastra build --studio` の本番成果物をNode 24.18.1で実行する。
StudioのAPI接続先は `MASTRA_AUTO_DETECT_URL=true` によりページと同一オリジンにする。
待受アドレス `0.0.0.0` をブラウザー向けURLとして使わない。

`chat` プロファイルで起動し、llama-serverの死活確認成功を待つ。
内部は `0.0.0.0:4111`、ホスト公開は `127.0.0.1:4111` のみ。
公開フロントから管理画面へ転送しない。設定サンプルの正本は `examples/compose.env`。

- `SINCRO_AGENT_ADMIN_TOKEN`: 管理者トークン。未指定なら初期化コンテナが生成・保存した値を使う。明示する場合は32文字以上を必須とする。
- `SINCRO_AGENT_LLM_URL`: `http://llama-server:8080/v1`。
- `SINCRO_AGENT_LLM_MODEL`: `gemma-4-E2B-it`。
- `SINCRO_AGENT_DB_URL`: Compose内で `file:/data/mastra.db` に固定する。

既定の `.env` は `full,chat` を選び、`docker compose up` でモデル取得と認証準備を自動実行する。
[初期化の流れ](../../infrastructure/compose.md#ローカル起動の原則)と
[認証情報の保存](../../infrastructure/storage.md#サービス間の認証)を参照する。

死活確認はイメージ内のNodeが認証付き `GET /api/agents` を呼ぶ。
設定不足は秘密値を含まないキー名のエラーで起動を拒否する。
モデル一覧の定期外部取得とMastraのテレメトリーは無効にする。

## 管理者認証とEditor

`http://127.0.0.1:4111` を開き、標準のSign in画面でログインする。
自動生成された管理者トークンは、管理者がローカルで次のコマンドで確認する。
表示した値をログや共有資料へ転載しない。

```sh
docker compose exec agent-server cat /run/sincromisor-auth/token
```

Email欄は形式上有効な例 `admin@example.test`、Password欄は管理者トークンを入力する。
SimpleAuthはEmailを利用者識別に使わず、トークンで管理者を判定する。
ログインCookieとBearer認証でStudioとAPIを共通に保護し、会話ユーザー登録やRBACは追加しない。
資格情報をURL、モデルの指示、ログ、公開検証資料へ入れない。

Agentsから「Sincromisorのキャラクター」を開き、Editorで指示を編集する。
下書きを保存して試験し、Publishで公開する。公開前の変更は通常APIへ反映しない。
コードの標準指示は日本語会話と任意の先頭表情コード `^N`。省略時は既存契約の標準表情になる。
Gemmaで必須の本文形式がツール選択を妨げることを確認したため、ツール呼出しへ表情コードを強制しない。Editorの既定動作を使い、公開済み設定があればそれを優先する。
初期化で保存済み指示を上書きしない。エージェントID `sincromisor-character`、モデルと実行設定はコード側に置く。

## 管理者トークンの変更

ルート `.env` の `SINCRO_AGENT_ADMIN_TOKEN` を32文字以上のランダム値へ変更し、
`docker compose down` → `docker compose up -d` で再作成する。
`SINCRO_PROCESSOR_MASTRA_TOKEN` が空欄なら同じ値を利用する。
別途設定している場合は、その値も新しい管理者トークンへ合わせる。
管理画面は新しいトークンでログインし直す。会話履歴と公開した指示は `agent-data` に残る。

空欄へ戻すと、`service-auth` に保存済みの自動生成トークンを再利用する。
毎回生成し直したり、最後に指定した手動トークンを自動生成値として保存したりはしない。
`down -v` は認証と会話の保存ボリュームも削除するため、キー変更の手順には使わない。

## 管理者のMCP接続

現時点の接続設定は `/data/mcp.json`。未配置または `{"servers": {}}` ならMCPを使わない。
管理者がローカルJSONを編集し、専用永続領域へコピーして再作成する。
接続先と認証はこのファイル、使用ツールの選択・公開はStudioのEditorで扱う。
会話ユーザーは公開されたツールを管理者の権限で利用する。ユーザー別資格情報は設けない。

```json
{
    "servers": {
        "local": {
            "url": "http://managed-mcp:8080/mcp",
            "headers": { "Authorization": "Bearer 設定する資格情報" },
            "timeoutMs": 20000
        }
    }
}
```

サーバー識別子は英小文字で始まる英小文字・数字・ハイフン、接続先はHTTP(S)とする。
認証情報をURLやエージェントの指示へ埋め込まない。認証ヘッダーはモデルへ渡さない。
`timeoutMs` は省略時20000ミリ秒、上限も20000ミリ秒で、Pythonの無受信30秒より先に失敗を通知する。
設定は[空の例](../../../../examples/mcp.json)から作り、秘密を含む実ファイルはGitへ追加しない。

```sh
chmod 600 /path/to/private/mcp.json
docker cp /path/to/private/mcp.json sincromisor-agent-server-1:/data/mcp.json
docker compose exec -u root agent-server chown node:node /data/mcp.json
docker compose exec -u node agent-server chmod 600 /data/mcp.json
docker compose --profile chat up -d --force-recreate --no-deps agent-server
```

ファイルは `agent-data` に保持される。JSON・設定不正と管理者以外へ読取り権限がある設定は起動を拒否する。
接続・一覧取得の失敗はサーバー名だけを記録して、その接続のツールを登録せず通常会話を起動する。
設定を直した後も再作成する。正常接続から得た `接続識別子_ツール名` がStudioのTools選択に現れる。
EditorのToolsで選択してSave New Version、Publishを行う。選択しないツールは会話へ渡さない。
Studio内のMCP Serversで任意ヘッダーを保存する経路は、この構成では使わない。

MCPClientは接続と非同期終了hookを所有し、プロセス終了時に切断完了を待つ。
`Mastra.shutdown()` 単独ではMCP接続を閉じないため、同一プロセス内の試験は登録結果の `disconnect()` を明示的に待つ。
呼出しには要求のAbortSignalを渡す。ツールエラーと時間切れは出力processorで会話を中断し、成功回答へ丸めない。
MCPエラー全文・接続認証・サーバーのログをモデルや公開ログへ流さない。

`mcp.ts` の設定スキーマ・`parseMcpConfig` と接続処理はファイルI/Oから分けている。
将来WebUIを追加する場合も同じ設定境界を使い、管理者認証下で `/data/mcp.json` を更新する。
現在は設定変更APIや画面、稼働中の接続入替えは提供しない。

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
