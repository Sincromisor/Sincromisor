# Dockerの状態変化とbandogの監視結果をログへ記録する

## 背景と目的

標準出力だけではOOMや強制終了を記録できない。
`Docker/consul/bandog.sh`も失敗件数を`/services.status`へ書くだけで、異常・復旧のログを持たない。
[各ホストの収集](../task-260921212104-vector-host-collection/task.md)へ状態イベントを加える。

## 変更範囲と方針

- 各ホストで対象コンテナの`start`、`die`、`oom`、`health_status`などを収集する。
- Docker Events APIまたは`docker events`のJSON出力をVector入力か小さな補助コンテナで収集する。独自の監視基盤は作らない。
- 対象コンテナID、Composeラベル、ホスト、発生時刻、終了コードを共通項目へ対応付ける。補助コンテナ自身を障害対象と誤記録しない。
- Dockerの`health_status`だけでなく、対象の`State.Health.Log`からチェックの開始・終了時刻、終了コード、診断出力を取得して状態変化と関連付ける。初回の異常状態、同じ異常状態で理由が変わる場合、履歴消失・取得失敗も区別する。
- Consulのチェック情報からサービスID・チェックID・対象ノード・状態・失敗理由の出力を収集する。bandogのDNS結果だけを失敗理由の代わりにせず、Consul取得不能時はその失敗を残す。
- 診断出力は長さを制限して切詰めを明示し、資格情報・URLの本文・チェックコマンド内の秘密を除去する。コマンドや環境変数の全量を保存しない。
- 権限と起動設定は収集タスクに合わせる。有限な履歴を使うため、停止中の無欠落・厳密な一度だけの配送を約束しない。
- bandogは初回結果とサービスごとの異常・復旧時にJSONLを出す。全サービス必須監視と`/services.status`の死活判定を維持する。
- bandogの実行ホストと監視対象サービスを区別し、DNS監視で分からない配置ホストを推測しない。Consulの診断には実際の対象ノード・インスタンスを残す。既存bandogの本体サービスの判定方法は維持し、ログ基盤は各ホストの収集インスタンスを含めて登録・異常を確認する。

## 棚卸しで具体化したチェック診断

[網羅性表H01](../task-260921221013-logging-coverage-inventory/coverage.md)のとおり、`compose/s3.yml`のwgetは出力を捨て、`compose/agent-server.yml`のfetchは終了コードだけを返す。
`State.Health.Log`の収集だけで理由が復元されるとは扱わず、必要なチェックに接続不能・HTTP状態など秘密を含まない短い診断を加える。
同じunhealthyでも異なるHTTP状態/通信失敗を区別する確認を行う。認証ヘッダー、チェックコマンド全量、応答本文は出さない。

## 完了条件

- [x] 検証コンテナの起動・終了・死活変化を対象コンテナとホストが分かる形で中央から抽出できる。
- [x] OOMイベントの固定入力を変換できる。実OOM確認を行う場合は専用のメモリー制限付きコンテナだけを使う。
- [x] bandogが正常→異常→復旧をサービス付きで記録し、同一状態のまま定期的に重複出力しない。
- [x] Dockerチェックの人工的な非ゼロ終了・診断出力と、Consulチェックの失敗理由を中央から抽出できる。状態だけでなく理由の変化と取得失敗も判別できる。
- [x] 出力の切詰めと秘密除去を確認し、会話本文の無効化をチェック出力で迂回しない。
- [x] 既存本体の死活判定を維持し、ログ基盤を監視対象へ追加する。イベント収集が業務サービスの起動条件にならない。

## 確認方法と文書同期

`scripts/tests/bandog-consul.test.mjs`などを使い、HTTP代役・隔離Consulで異常と復旧を確認する。
Dockerイベントの固定入力と実コンテナの起動・停止で中央までの流れを一度確認する。稼働サービスやホスト全体のメモリーへ障害を注入しない。
`documents/design/infrastructure/logging.md`、`consul.md`、追加Compose手順を同期する。
2026-09-21確認の[Docker Events](https://docs.docker.com/reference/cli/docker/system/events/)に従い履歴と再接続の限界を記載する。

## 対象外

カーネル・Dockerデーモン障害は[ホスト診断](../task-260921221014-host-system-diagnostic-logs/task.md)で収集する。通知先追加と本体の監視判定の再設計は行わない。

## 実装と確認結果

2026-09-22、Go標準ライブラリだけの`log-observer`を標準プロファイルへ追加した。
Dockerの状態変化・health実行結果と、Consulの実ノード・インスタンス・チェックの診断をJSONLへ出す。
補助処理のAPI取得失敗は自身の診断とConsulのcriticalへ反映し、業務サービスの起動依存は追加しない。

Consulの同じcritical状態のままOutputだけを変更すると、ローカルagentには反映されてもcatalogは古い出力のままになることを隔離環境で再現した。
全ホストの補助処理がローカルagentを直接取得し、その結果を優先するよう修正した。クラスタ結果だけで理由を収集できるとは扱わない。
任意のチェック出力は保存せず、HTTP状態や接続失敗などの既知の安全な分類だけを残す。2048バイトを超える診断には切詰めを明示する。

- `GO111MODULE=off go test -race ./Docker/logging/observer`、同パッケージの`go vet`: PASS。人工OOM、非ゼロhealth、理由変更、履歴欠落、inspect 403、Consul取得失敗、直接agent優先、秘密と本文の非出力を確認した。
- `node --test scripts/tests/bandog-consul.test.mjs`: PASS。既存必須サービスのDNS判定と、初回・異常・復旧の遷移、同状態の重複抑止を確認した。
- AgentServerの実fetchコマンドとS3のチェックシェル: HTTP 200/503/403・接続失敗の6ケースPASS。応答本文・資格情報を出さず、終了値を維持した。
- `node --test scripts/tests/log-lifecycle.test.mjs`: PASS（約86秒）。実コンテナのstart/die/healthと503→403→接続失敗、Consulの実ノード・チェック理由を中央検索し、人工本文と資格情報の非出力を確認した。
- `node --test scripts/tests/log-healthchecks.test.mjs`: PASS。実ComposeのAgentServerコマンドとS3チェックの安全な診断を再実行可能にした。
- Compose構成検証、補助収集イメージのビルド、Biome、Markdown整形、差分空白確認はPASS。

変更シンボルと直接の理解範囲のコメントを点検し、Docker対象と収集元の区別、有限履歴、Consul同期遅延、診断の非出力範囲、既存bandog判定の維持を補足した。
Docker Eventsの直近256件・有限health履歴と、秒単位の取得境界での重複を文書化した。停止中の全履歴は保証しない。
先行Vectorタスクの全体ゲートには変更前からのMarkdown整形不整合が残る。今回フロント実装は変更していない。
