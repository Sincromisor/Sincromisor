# Review: task-260802032908-pion-phase-3-outbound-audio-datachannel

## 判定
APPROVED

前回のqueue overflow、Frontend JSON変換、comment acceptanceのHigh指摘はすべて解消された。
改訂箇所に新たなblocking矛盾はなく、実装に進めてよい。

## 指摘事項
- なし。

## 実装者への申し送り
- synthesized speechは既存発話をevictせずincomingを `ErrSpeechQueueFull` で拒否しsession close、
  textもincoming拒否とsession close、telopだけ最古1件dropとsession継続である。上限ちょうどまでは
  queueの許容範囲（8発話、合計120秒、text 64件、telop 128件）として境界testを固定すること。
- `internal/rtc/data_channel_payload.go` の専用DTOへ明示変換し、pipeline DTOへJSON tagを追加しない。
  `expression_code` はnilを省略しzeroを保持する条件を共有fixtureで確認すること。
- 現行Opus trackはstereo SDP capabilityであるため、task記載どおりmono PCMのencode/playbackを
  local pairで確認すること。
- `internal/...` の参照は `sincromisor-server/sincro-rtc-pion-poc` module root相対である。
