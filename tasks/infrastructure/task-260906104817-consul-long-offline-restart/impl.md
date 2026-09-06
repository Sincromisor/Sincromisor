# 実装・検証記録

## 判断

データを削除せず、Consul標準の `server_rejoin_age_max` を設定する局所変更とした。
10年は無期限ではないが、開発休止を許容しつつ既存の永続化を維持できる。
過去障害のログは取得しておらず、今回再現した原因への対策である。

## 再現手順と結果

2026-09-06、ローカルの `hashicorp/consul:latest`（Consul v2.0.3、イメージID
`sha256:56a8d0fdbfcb35836c4ce2fc8a5d34eac48594ef067bbe4af7d5ceb9fb08c28d`）で確認した。
既存環境から隔離した一時コンテナを使い、ネットワークを `none`、待受先を `127.0.0.1`、
データ保存先を `/tmp/offline-data` とした。

1. `consul agent -server -bootstrap-expect=1 -bind=127.0.0.1 -data-dir=/tmp/offline-data -config-file=/tmp/test.hcl` で起動する。
   設定ファイルは `server_rejoin_age_max = "168h"` とし、`consul operator raft list-peers` でリーダー選出を待つ。
2. `consul kv put offline-check preserved` で値を保存してコンテナを停止する。
3. 停止中に `docker cp` で `/tmp/offline-data/server_metadata.json` を上書きする。
   内容は `{"last_seen_unix": <現在のUNIX秒から2592000を引いた整数>}` とし、30日の停止を模す。
4. 再起動すると `refusing to rejoin cluster` を含む起動エラーが繰り返された。検証コンテナを停止した。
5. `docker compose --env-file examples/compose.env --profile full config --format json` の起動引数から
   `server_rejoin_age_max = "87600h"` を取得し、停止中に同じ設定ファイルへ反映して再起動した。
6. `consul operator raft list-peers` でリーダー選出、`consul kv get offline-check` で `preserved` を確認した。
   検証コンテナとその匿名ボリュームだけを削除した。

Composeの環境変数が空欄の場合は `87600h`、明示的に `240h` を指定した場合は `240h` になることも確認した。
既存 `.env` には追加設定がなく、実環境への反映でも既定値が使われることを確認した。

## 実環境への反映

`docker compose --profile full up -d --no-deps --pull never sincro-consul-server` でConsulだけを再作成した。
起動引数の `87600h`、死活確認の `healthy`、`server01` のリーダー選出を確認した。
サービス登録は反映前後ともConsul自身を含む10件で一致した。
イメージの取得・更新や既存データの削除は行っていない。

## 確認範囲

変更Markdownの整形・文書点検、Compose設定コメントの点検はPASS。
設計索引には既にConsul文書へのリンクがあり、導線の追加は不要だった。
本番アプリケーションコードの変更はなく、フロント・Python・Goの全体試験は対象外。
実際に30日間停止する試験、複数サーバー構成、証明書の期限切れは未検証であり、今回の対象外である。

`npm run tasks:index:check`、`npm run tasks:check`（352件）、変更MarkdownのPrettier検査、`git diff --check` はすべて成功した。
