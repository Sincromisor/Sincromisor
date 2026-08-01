# Review: task-260802032912-pion-phase-3-initial-signaling-idempotency

## 判定

APPROVED

前回のconfig schema、single-flight owner lifecycle、comment acceptanceのHigh指摘はすべて解消された。
改訂箇所に新たなblocking矛盾はなく、実装に進めてよい。

## 指摘事項

- なし。

## 実装者への申し送り

- 3 flagはdefaultをproduction上限とし、小さい値だけを許可する。値の正本をtyped configへ集約し、
  CLI、constructor、READMEでdefault/rangeを重複して食い違わせないこと。
- ownerはrequest contextから切り離す一方、process contextとgather timeoutには従う。全waiter cancel、
  process shutdown、owner timeoutの各経路でin-flight entry、session reservation、PeerConnection、
  goroutineを残さないこと。
- active sessionのadmissionは作成予約をManager lock下で数え、並行requestでも100を超えない条件を
  race testで確認すること。
- body上限超過は現行の一律400変換から413へ分類する必要がある。PeerConnection作成前に拒否すること。
- `internal/...` の参照は `sincromisor-server/sincro-rtc-pion-poc` module root相対である。
