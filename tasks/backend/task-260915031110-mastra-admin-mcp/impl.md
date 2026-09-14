# 実行前提の確認

## 停止理由

採用版のMastraでは、Studioで任意のMCP認証ヘッダーを設定・保存する機能がない。
タスクが同時に指定する「独自設定UIやマーケットプレイスは作らない」と両立しないため、
認証情報の設定方法に関するユーザー判断を待つ。MCP実装と依存追加は未着手。

## 確認した事実

- `@mastra/core` 1.66.0の `StorageMCPServerConfig` と保存APIのスキーマには、HTTPの `url` / `timeout` があり、任意の認証ヘッダーはない。
- `@mastra/editor` 0.14.5の `EditorMCPNamespace.toMCPServerDefinition` は保存設定からURLと待ち上限を作る。`resolveStoredMCPTools` が追加する認証は `mastra__authToken` 由来のAgentServer管理者Bearerだけであり、MCP固有資格情報を保存・指定できない。
- `@mastra/mcp` 1.17.3のコード定義クライアント自体は `requestInit.headers` を扱える。Studioの保存・解決経路には渡す欄がない。
- 独立したtask-reviewerも同じ不足を確認した。既存review.mdは起票時の想定に対する判定であり、この採用版の制限を解消するものではない。

## 再開条件

認証情報を管理者専用のローカル設定へ分けるか、Studio側の入力・保存機能も拡張するかを決め、
タスクの設定方法と変更範囲を改訂する。資格情報をURLやモデルの指示へ埋め込む回避策は採用しない。
未設定のAgentServerとGemmaは通常会話が動作する状態を維持している。

依存するDify切替・撤去は未着手。独立して実行できるテキスト変換タスクを先行した。
