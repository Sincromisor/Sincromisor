# Review: task-260802032916-pion-phase-3-backend-ice-restart

## 判定

APPROVED

前回のupdate Offer `talk_mode`、candidate canonicalization、comment acceptanceの指摘はすべて解消された。
改訂箇所に新たなblocking矛盾はなく、実装に進めてよい。

## 指摘事項

- なし。

## 実装者への申し送り

- update `talk_mode` はmissing/enum外を400、保存済み有効値との不一致を409とし、pipelineのmodeは変更しない。
- candidate fieldのmissingは400、explicit nullは有効なend-of-candidatesである。optional fieldの
  missing/nullはdedupe上同一、文字列はtrim/case変換しないというcanonicalizationを共有fixtureで固定すること。
- 同revision/同SDPの保存済みAnswer返却は完了後の直列再送に適用し、update処理中の並行Offerは409とする。
- 現行 `session.go` は `disconnected` / `failed` を即closeするため、grace/deadlineへ置換し、
  timer callback、natural recovery、successful update、Closeの競合をclose-onceへ収束させること。
- `internal/...` の参照は `sincromisor-server/sincro-rtc-pion-poc` module root相対である。
