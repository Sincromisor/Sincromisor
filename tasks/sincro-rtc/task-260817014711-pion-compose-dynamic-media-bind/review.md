# レビュー: task-260817014711-pion-compose-dynamic-media-bind

## 判定

APPROVED

## 理由・申し送り

- 完了条件は、固定 IP 設定の不在、interface 上の IPv4 選択と fail-fast 条件、UDP4 mux の bind、Consul server の healthy 依存、再作成後の ready をそれぞれ観測可能な形で定めている。
- 現行 `internal/config` は `--media-udp` の literal IPv4 を `--interface` の address と照合してから、`cmd/pion-poc/main.go` が listener を開く。`net.InterfaceByName` / `Interface.Addrs` で解決済み IPv4 と port を `net.ListenUDP("udp4", ...)` へ渡す変更は、既存の process-wide UDP mux の唯一の close owner と起動時 fail-fast 契約を維持して実装できる。
- `sincro-rtc-pion` は現在 `SINCRO_PION_CONSUL_HTTP_HOST=sincro-consul-server` を HTTP endpoint として直接使い、Pion 専用 Consul agent を持たない。`sincro-consul-server` の healthcheck は既存で定義済みのため、同 service への `depends_on: condition: service_healthy` は責務を増やさず、指定された起動順序を一意に実装できる。
- public candidate、container 内 bind address、host/container UDP port mapping、Consul registration address の責務分離と、失敗時の証拠採取・原因修正・再検証の順序が明記されている。private evidence の失敗記録だけで完了する契約にはなっていない。

## 自律補完

- `AUTO_FIX`: `--media-udp` を削除すると、変更範囲に列挙済みの `internal/config/config_test.go` だけでなく、既存の `cmd/pion-poc/startup_test.go` と `cmd/pion-poc/main_integration_test.go` の CLI 引数も新しい `--media-udp-port` へ機械的に同期する。根拠は現行テストが当該削除対象 flag を直接指定しており、公開契約・責務・受け入れ条件を変えないため。
- `AUTO_FIX`: `task.md` 末尾に残った未記入の AUTHORING-CHECKLIST 雛形は削除する。先行する本文が同じ各節を完結しており、雛形は受け入れ条件を追加せず可読性だけを損ねるため。
- `AUTO_FIX`: config と起動境界を変更する実装では、コメント要件を task 本文へ複製せず `documents/rules/source-comments.md` を直接参照して適用する。根拠は同文書と `tasks/AUTHORING-CHECKLIST.md` の実装時規約である。
