# aiortcとPionを排他的に選択するcompose構成を追加する

## 背景 / 目的

現在のcomposeはPython aiortc版`sincro-rtc`だけを起動する。stable signaling endpointを保ったまま
Pionを選択でき、誤って両backendを運用起動しない構成がPhase 4の停止切替に必要である。

## 完了条件（受け入れ条件）

- [ ] aiortc版とPion版を明示的なprofileで個別に起動でき、既存`full` profileはPhase 5まではaiortc版を維持する。
- [ ] 両serviceは同じstable TCP portを使い、同じcompose projectで同時起動を試みるとport競合で失敗する。
- [ ] Pion profileは固定UDP portをhost/container同値で1:1公開し、public IPv4、interface、STUN、session上限、
      Consul接続、FFmpeg pathを`examples/compose.env`からproduction network設定へ渡す。
- [ ] Pionのreadiness healthcheckとrestart policyが設定され、aiortc停止後の起動とPion停止後のaiortc復旧を
      Frontendや下流4 serviceのbuild変更なしに実行できる。
- [ ] `docker compose config`で各profileのservice、port、環境変数、依存関係を確認できる。

## 設計判断

- Phase 4ではprofileによる明示選択に留め、stable service名の全面置換はPhase 5で行う。
- 排他制御用のselector scriptや新しいorchestratorは作らず、stable TCP portの占有を安全弁にする。

## スコープ境界

- 本タスク: compose service/profile、env sample、healthcheck、restart policy、compose設計。
- 依存: production network設定、Pion container image、Pion container readiness probe、Pion compose network contract。
- スコープ外: 実firewall/NAT変更、実地smoke test、Phase 5の既定backend切替。

## 実装方針

`compose/sincro-rtc.yml`の既存aiortc serviceを残し、Pion serviceを追加する。下流serviceとConsulは既存network、
profile、service discoveryを再利用し、Pion専用adapterは追加しない。

## テスト

- aiortcのみ、Pionのみ、両profile指定の`docker compose config`を確認する。
- 両backendの同時bindが成功しないことをlocal composeで1回確認する。
- `npm run gate`と`npm run tasks:check`。

## ドキュメント同期の要否

要。`examples/compose.env`、`documents/design/infrastructure/compose.md`、
`documents/migration/pion/rollout-and-operations.md`へprofile、port、設定値を同期する。現在設計上の正本backendは
Phase 5までaiortcのため、architecture/service設計の全面置換は行わない。
