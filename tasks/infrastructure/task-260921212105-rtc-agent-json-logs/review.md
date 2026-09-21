# レビュー: task-260921212105-rtc-agent-json-logs

## 判定

APPROVED

## 理由・申し送り

- RTCの`startup.go`、`main.go`、既存の`process_log_test.go`と、AgentServerの`application.ts`、`config.ts`、`mcp.ts`に対象の出力境界がある。共通ログ契約に基づくJSONL化、会話IDの対応、本文切替は既存契約の実装であり、固定入力と既存テストによる確認は最小である。
- RTCは通常ロガーを作る前の`main.go`で起動失敗を標準エラーへ出す。ここも1行JSONにし、設定値・URL・認証値を含み得る生のエラー文字列をそのまま出さない。通常経路は`startup.go`の`JSONHandler`へ統一し、すでに使う`session_id`、`stage`、`reason`を保持する。本文や未保持の発話IDをRTCで新設せず、通信形式も変更しない。
- TextProcessorは`memory.thread = sincromisor:<session_id>`でAgentServerへ会話を渡す。この既存の対応だけをAgentServerの要求処理ログへ正規化し、本文全体や履歴を複製して会話IDを作らない。AgentServerで取得できない`speech_id`、`sequence_id`、`message_id`は空のままとする。
- AgentServerは`SINCRO_AGENT_ADMIN_TOKEN`、MCPヘッダー、MCPの下位例外、LLM要求を扱う。`config.ts`と`mcp.ts`は既に入力値をエラーへ含めない境界を持つため、JSONLロガー、標準出力、Mastraの既存ログ、MCP transport loggerで同じ秘匿を保つ。Authorization、Cookie、MCPヘッダー、本文・プロンプト、ツール入出力、例外内の要求断片を出力しない。
- `SINCRO_LOG_CONVERSATION_ENABLED`はAgentServerの設定検証、Compose、設定例へ同期し、未指定を有効、`true` / `false`以外を起動失敗にする。無効時も開始・成功・失敗などの運用イベントは本文なしで残し、Mastraの機能用履歴とDBを変更しない。TextProcessorが既に本文の主記録元なので、AgentServerには重複記録用の本文イベントを増やさない。
- MCPは`connectMcp()`で接続を所有し、ツールの`execute`境界で開始、成功、失敗、所要時間、設定上のserver IDとtool名を記録できる。未設定は空のツール集合なので、MCP未稼働を示す固定イベントまたは既存の起動状態で区別する。失敗は現在と同じくモデルの正常応答へ変換せず、下位の秘密を含み得る例外は固定の失敗理由に畳み込む。再試行、内部推論、全量入出力、分散トレースは本タスクの対象外である。
- `llama-server`は採用済みイメージの実ログを一度確認し、本文・プロンプトを出す場合だけ当該固定版が支持する公式設定をComposeへ反映する。未確認のフラグを追加せず、無効時に止められない出力はDocker原本に残る範囲と後続Vectorでの除去を明記する。

## 自律補完

- `AUTO_FIX`: AgentServerには、`memory.thread`の`"sincromisor:"`接頭辞を除いた既存`session_id`だけを要求処理の構造付き属性として記録する。TextProcessorとAgentServerを対応付ける既存契約が根拠であり、追加の会話識別子は作らない。
- `AUTO_FIX`: MCPの所要時間はツール実行の所有者である`execute`ラッパーで単調時計測し、server ID、tool名、結果区分だけを出す。入力、出力、ヘッダー、例外全文を計測用イベントへ渡さない。
- `AUTO_FIX`: GoとMastraの時刻・本文キーは各出力元で共通項目へ揃え、Vectorではホスト・Compose・コンテナ由来項目だけを追加する。二重変換や二重本文記録を避けるためである。
