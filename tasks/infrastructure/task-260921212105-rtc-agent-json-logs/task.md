# RTCとAgentServerのログを共通形式へ揃える

## 背景と目的

RTCは`slog.NewTextHandler`、AgentServerはMastraのロガーを使う。
[共通仕様](../task-260921212053-victorialogs-foundation/task.md#共通仕様)に合わせ、既存の標準・製品ロガーで会話ログを横断検索できるようにする。

## 変更範囲と方針

- Goの`cmd/sincro-rtc/startup.go`を`slog.JSONHandler`へ変更し、既存の`session_id`、`stage`、`reason`を保持する。
- `cmd/sincro-rtc/main.go`の起動失敗など、通常ロガー作成前の標準エラーも確認する。自前出力をJSONLにし、起動失敗処理を複雑にしない。
- AgentServerの`src/mastra/application.ts`、`mcp.ts`と起動経路で採用済みMastraの設定を確認し、JSONLへ出す。
- 固有の時刻・本文キーを共通項目へ対応付け、出力元かVectorのどちらで変換するかを一箇所に決める。
- AgentServerの対話本文出力にも`SINCRO_LOG_CONVERSATION_ENABLED`を適用し、`config.ts`、`compose/agent-server.yml`と設定サンプルを同期する。
- 本文の主な記録元はTextProcessorとし、AgentServerに本文を重複記録するためだけの処理を増やさない。Mastraの既存本文ログは切替の抜けを防ぐ。
- TextProcessorが送る`memory.thread = sincromisor:<session_id>`を使い、取得できるAgentServerの要求処理ログと会話IDを対応付ける。保持していない発話IDを作らない。
- llama-serverが本文・プロンプトを出す場合は無効時の扱いを明示し、必要な公式ログ設定をComposeへ反映する。
- MCPの接続・ツール呼出しについて、開始・成功・失敗・所要時間・相手先の識別を残し、未使用時は対象未稼働と分かるようにする。認証の秘密は出さない。内部の失敗理由は[診断タスク](../task-260921221014-runtime-failure-diagnostics/task.md)で補い、外部ツールの全量入出力・内部推論・分散トレースの要否は[網羅性表](../task-260921221013-logging-coverage-inventory/task.md)で理由と担当を明示する。

## 完了条件

- [ ] RTCの起動・セッション・エラーとAgentServerの自前ログをJSONLで読め、診断属性が失われない。
- [ ] RTC・TextProcessor・AgentServerのID対応を説明でき、AgentServerの処理ログを会話IDで抽出できる。
- [ ] 未指定・有効時の内容記録を維持し、無効時にAgentServer経由で対話本文を運用ログへ出さない。認証情報は常に出さない。
- [ ] RTC・Mastra API、会話履歴、MCP、LLM接続の挙動を変えない。

## 確認方法と文書同期

対象Goテストで出力をJSON解析し、レベル・本文・属性を確認する。
AgentServerの既存テストで人工的なIDと本文を使い、JSON出力、設定検証、無効時の本文非出力を確認する。
第三者の起動・アクセスログは実出力を一度確認する。RTCメディア全体の長時間試験は追加しない。
`documents/design/infrastructure/logging.md`、`backend/services/sincro-rtc.md`、`backend/services/agent-server.md`を同期する。

## 対象外

RTC・音声パイプラインの通信形式変更と機能用会話履歴の停止は行わない。JSON化だけで失敗診断が揃ったと判定せず、FFmpegなどは診断タスクの完了を待つ。
