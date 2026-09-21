# 評価: task-260921212104-vector-host-collection

## 判定

PASS

## 根拠

- `compose/log-collector.yml` は既存の全プロファイルへ Vector・`log-router`・`consul-agent-logging` を一つずつ加え、`configs/vector.toml` は Compose プロジェクトラベルだけを Docker API から取得する。全プロファイルの展開では36サービス、MediaMTX・MinIOも選んだ展開では38サービスがあり、いずれも全サービスで Docker の `local` ドライバーを設定していた。
- Dockerソケットは `:ro` でも管理権限であることを Compose の近接コメントと `logging.md` に明記し、特権指定やホストへの Docker API 公開はない。本文由来の `host`、`project`、`service`、`container_id`、`stream`、`observed_at` は収集側で再設定し、固定入力3件で偽装識別子と認証属性の除去、日本語・例外・stderrの重大度を確認している。
- Vectorの Docker 入力は公式仕様どおり自身のコンテナIDを hostname から除外し、内部ログは `internal_logs` で一度だけ受ける。標準出力への再送先もないため自己循環しない。
- 隔離Compose確認（`scripts/tests/log-collector.test.mjs`、PASS、221秒）で、未登録時とConsul停止時の503・バッファ保持・復旧後再送、中央停止中のバッファ滞留、中央IP変更を伴う再作成後の再送、Vector停止中の`docker logs`原本、対象外プロジェクト除外、新規コンテナの収集を確認している。Caddyは`SincroLogs.service.consul`を収集用Consul DNSへ5秒ごとに明示解決し、中央IPをVectorへ渡していない。
- `SincroLogCollector_<host>` と `SincroLogRouter_<host>` の個別Consul登録、8320/TCP・UDPの分散公開、bandogのDNS確認を追加し、`examples/compose.env`、`compose.md`、`consul.md`、`logging.md`を同期した。変更MarkdownはPrettier確認済みで、設定・シェルの必要な境界コメントも現行の挙動と一致する。

## 残課題

なし
