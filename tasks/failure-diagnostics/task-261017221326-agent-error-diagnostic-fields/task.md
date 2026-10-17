# AgentServerの失敗ログに型と既知コードを残す

## 背景 / 目的

AgentServerのfailureReasonは複数の例外をfailed/http_failureへまとめ、loggerの属性選別も例外型・HTTP状態の詳細を保持しない。LLM・MCP・保存の既存観測点を生かして情報を補う。

優先度: 中。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

なし。単独で着手できる。

## 担当範囲

- [sincromisor-server/agent-server/src/mastra/runtimeDiagnostics.ts](../../../sincromisor-server/agent-server/src/mastra/runtimeDiagnostics.ts)
- [sincromisor-server/agent-server/src/mastra/logging.ts](../../../sincromisor-server/agent-server/src/mastra/logging.ts)
- [sincromisor-server/agent-server/src/mastra/mcp.ts](../../../sincromisor-server/agent-server/src/mastra/mcp.ts)
- [sincromisor-server/agent-server/src/mastra/**tests**/logging.test.ts](../../../sincromisor-server/agent-server/src/mastra/__tests__/logging.test.ts)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: Mastra更新、対話本文の重複記録、任意例外全文の収集、LLM/MCP再試行の変更。

## 設計判断

- 既存の4段までのcause走査を再利用し、認識した例外型、既知のシステム/DBコード、数値HTTP状態を診断用属性へ変換する。任意error.name/codeを無検証で出さず、未知はunknownとする。
- 属性選別へ安全な診断項目だけを追加し、既存LLM/MCP/保存の失敗観測点から渡す。新しい横断ラッパーや全スタック文字列の保存は導入しない。
- 回復可能な失敗はwarn、要求を終える失敗はerror、取消・成功はinfoを基本に、変更する観測点だけのlevelとoutcomeを揃える。

## 完了条件

- [ ] 503と他のHTTP異常、DB権限・容量エラー、接続拒否をreasonに加えて安全なコードで識別できる。
- [ ] 親・子ロガーとライブラリ経由でも診断項目が保持され、未知例外のメッセージ・URL・ツール入出力・資格情報が出ない。

## 確認方法

- AgentServerの既存runtimeDiagnosticsとlogging/MCPテストを拡張する。実PinoのJSON出力とcause制限、未知属性の除去を確認し、対象テストとnpm run checkを実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)
- [documents/design/backend/services/agent-server.md](../../../documents/design/backend/services/agent-server.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。
