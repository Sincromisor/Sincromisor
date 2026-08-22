# 評価: task-260823061841-pion-phase-6-python-rtc-removal

## 判定

FAIL

## 根拠

- Python RTC stack、aiortc profile / service / agent、`audio-broker.md`は削除され、`full` / `rtc` profileはPion `sincro-rtc`だけを解決する。MessagePack golden fixtureは `sincromisor-server/sincro-rtc/internal/pipeline/protocol/testdata/` に維持されている。
- `GOCACHE=/tmp/phase6-eval-gocache go test ./...` はsandboxのloopback socket制限で失敗したが、同一commandをnetwork制限なしで再実行してPASSした。`uv lock --check`はPASS。Ruffは変更前からの範囲外110件でFAILし、今回の削除で悪化した証拠はない。`tasks:check` と `tasks:index:check` はPASSした。
- canonical renameの完了条件に反して、通常serviceの本番コードとREADMEにPoC名称・前提が残る。`sincromisor-server/sincro-rtc/cmd/sincro-rtc/main.go`の通常起動 / 停止logは `pion poc listening` / `pion poc stopped`、`internal/config/config.go` のpackage commentは `Pion PoC`、同READMEも `pion poc stopped` とPoC境界を通常service説明として残す。加えてConfigのdoc commentはproduction composeとConsulをPoC対象外とするが、現在のcomposeはConsulを使う通常運用である。taskの「`pion-poc`ではなく通常serviceの`sincro-rtc`として配置・命名」とcurrent docs / source commentsの要件を満たさない。

## 残課題

- `sincromisor-server/sincro-rtc/` のlog message、README、package / Config doc commentからPoC名称と現在運用に反するPoC境界を削除・更新し、対応するテスト期待値も同期する。
- VPS再deploy（rebuild / recreate、readiness、Consul `RTCSignalingServer` passing、active session 0）は未実施。上記修正後の最終PASSにはこのcheckpointが必要である。
