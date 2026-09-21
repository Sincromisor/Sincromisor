# レビュー: task-260921212106-distributed-logging-acceptance

## 判定

APPROVED

## 理由・申し送り

- `task-260921212053-victorialogs-foundation`、`task-260921212104-vector-host-collection`、`task-260921212105-python-conversation-logs`、`task-260921212105-speech-synthesis-logs`、`task-260921212105-rtc-agent-json-logs`、`task-260921212106-container-lifecycle-logs`、`task-260921221013-logging-coverage-inventory`、`task-260921221013-browser-diagnostic-logs`、`task-260921221014-runtime-failure-diagnostics`、`task-260921221014-host-system-diagnostic-logs`、`task-260921221014-logging-delivery-recovery`、本タスクの12件を、`be045701692380cce2d8ce85712d93c90556b79f`で再レビューした。
- 標準の`docker compose up`に中央保存、各ホストの収集、`log-router`、`consul-agent-logging`を含める。中央は1ホストだけが担当し、収集は各担当プロファイルに同梱するため、単一ホスト起動と複数ホスト配置の両方で別のログ用プロジェクトや手動の先行起動を要求しない。
- Vectorの接続先は`log-router`へ固定し、Caddyが同居Consul DNSへ`SincroLogs.service.consul`を明示照会して5秒ごとに再解決する。中央不在・登録変更・接続失敗は5xx、Vectorの永続バッファと再試行で扱うことまで決まっている。既存の`configs/Caddyfile`の動的DNS転送と整合し、Vectorに未確認のサービス発見機能を仮定しない。
- 本文を既定で保存する2設定は独立し、自前出力元で停止し、第三者サービスでは公式設定または中央投入前のVector除去を使う。保存済みログ、機能用会話履歴、音声・キャッシュは切替対象外と明記され、中央・ローカル原本・例外・URLでの試験本文の確認が結合条件にある。
- 従来のコンテナ標準出力だけでは不足するブラウザー、Docker/Consulのチェック理由、FFmpegなどの内部失敗、ホストのDocker・カーネル障害、収集停止後の残存原本回収・欠落検知・バックアップ復元を個別タスクにした。棚卸し表は追加の不足を担当未定のまま残さず、最終結合確認は2ホストがなければ未実行のままとしてPASSにしない。
- 原本削除・容量超過・同期前の強制終了・ブラウザー未送信・物理故障は回収不能の境界を示し、回収可能な条件の取りこぼしは記録だけで合格にしない。無根拠な性能値や網羅試験は加えず、人工ログ・固定入力・隔離環境で必要な経路を確認するため、各タスクは実装可能な最小単位に分かれている。

## 自律補完

- `AUTO_FIX`: 棚卸しで既知の担当に収まらない必須の発生源が判明した場合は、既存タスクを具体化するか小さな依存タスクを追加し、最終結合確認の依存へ加える。未確認を対象外へ移して完了させないという既定の手順であり、ユーザー確認は不要である。
- `AUTO_FIX`: 各ホストの実際のjournalまたはsyslogの読取経路、読取権限、中央担当プロファイルは、対象ホストの既存設定を確認して`examples/compose.env`と導入・ログ設計へ記録する。環境に依存する配備設定であり、取得できない範囲は収集正常と見なさず診断として残す。
