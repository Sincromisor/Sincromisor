# Review: task-260802032908-pion-phase-3-outbound-audio-datachannel

## 判定

APPROVED

前回のgeneration通知、telop wire変換、speech queue境界の3件のHigh指摘はすべて解消された。
改訂箇所に新たなblocking矛盾はなく、実装・race test・公開契約同期の期待値も一意である。

## 指摘事項

- なし。

## 実装者への申し送り

- `GenerationChanges() <-chan uint64` は複数receiverへのbroadcastではなく、1値を1 receiverだけが受け取る
  Go channelである。OutputProcessorとdispatcherが同じchannelを別々にrangeして通知を奪い合わないこと。
  Session所有の単一consumerから両者のpurgeを適用するなど、1回のgeneration観測で旧audio、text、telopを
  すべて破棄し、次generationのoutputがないreset race testで両queueのpurgeを確認すること。
- generation stateは単調増加する1つの適用点に集約し、generation通知と各output envelopeのどちらが先でも、
  より古い通知・envelopeが新generation適用後のqueueへ再混入しないようにすること。Coordinator側は
  task記載どおり`outputMu`内でadvance、旧output drain、capacity 1通知更新を直列化し、全producer join後に
  text/synth/generation channelをcloseすること。
- telopは各20 ms frameの開始sampleでactive moraを決定する。nilの`vowel` / `text`はempty string、
  `message`はdecode前の同じresultから保持し、frame内mora境界は次frameで切り替え、active moraなしでは
  audioだけを送る。共有fixtureと`documents/design/contracts/frontend-rtc.md`を同じ規則で同期すること。
- speech queueは8発話・48 kHz mono PCM 120秒ちょうどまで受理し、追加後にどちらかを超えるincomingだけを
  `ErrSpeechQueueFull`で拒否する。件数とsample合計をそれぞれlimit-1 / limit / limit+1で固定すること。
- `installOutboundTrack`のpre-Answer登録、`transportReady`でのRTCP drain / outbound開始、
  lifecycle mutex内の起動権・WaitGroup予約、lock外のgoroutine開始を維持すること。DataChannelも
  属性検証、同label object identity、OnOpen identity、readiness AND latchを迂回しないこと。
- SessionはOutputProcessorとdispatcherを所有resourceとして回収する一方、process-wide
  `SynthDecoder`は非所有参照のままcloseしない。comment audit / acceptanceは改訂済み条件に従うこと。
