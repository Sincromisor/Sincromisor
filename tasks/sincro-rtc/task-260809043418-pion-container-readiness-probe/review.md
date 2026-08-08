# レビュー: task-260809043418-pion-container-readiness-probe

## 判定

APPROVED

## 理由・申し送り

- `Docker/sincro-rtc-pion-poc/Dockerfile` の runner stage は Ubuntu 24.04 で `apt-get install` を使い、最後に `USER sincromisor` を指定している。既存の同じ install 行へ `curl` を追加し、既定 user のまま `docker run --entrypoint curl ... --version` を実行すれば、追加物と非root実行を一意に検証できる。
- `/health/ready` は Pion signaling の既存 HTTP 契約であり、startup 完了かつ非draining時だけ 200、draining 時は 503 となる。probe task はこの endpoint の実装・port mapping・healthcheck stanza を変更せず、後続 compose task が consumer として `127.0.0.1:8001` を選ぶため、責務境界は明確である。
- README と migration 運用文書は、後続 compose の command、endpoint、成功条件を同期する公開運用契約の正本として妥当である。Frontend RTC 契約は対象外である。
- `docker build` または必須 gate が失敗した場合は、`tasks/README.md` の「失敗時の調査と継続」に従い、失われる前に command・対象 commit・時刻・exit code・関連 log を採取し、直接原因の修正後に失敗した確認と全体 gate を再実行する。原因未特定のまま完了・移管はしない。

## 自律補完

- `AUTO_FIX`: task.md のテスト節に、上記の失敗時手順を `tasks/README.md#失敗時の調査と継続` への参照として追記する。既存のタスク運用正本が手順を一意に定めており、公開契約・責務・受け入れ条件は変わらない。
