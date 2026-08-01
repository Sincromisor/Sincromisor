# Review: task-260802032918-pion-phase-3-frontend-ice-restart

## 判定

APPROVED

前回のHigh指摘だったretry/error終端、comment acceptance、設計index同期は具体化され、実装・評価の期待値が一意になった。
残る行参照精度は実装者への注意で足り、実装を止める破綻ではない。

## 指摘事項

- [Medium] 既存コード参照の行番号は未修正である。`rtcTalkClient.ts:15` はclassの既存コメントで、
  readonly PeerConnection/DataChannelの実体は
  `sincromisor-frontend/src/features/rtc/rtcTalkClient.ts:20-22`、再交渉時のsession ID clearは同`:80`である。
  前提自体は正しいためblockingではないが、実装・評価時は実体の行を参照すること。

## 実装者への申し送り

- retryは500 ms/1秒/2秒のfull jitter、総30秒、`Retry-After`超過時terminalと確定し、
  candidateを含む失敗時のqueue破棄・PeerConnection close・自動再作成条件も定義された。
  AbortController timeoutを実装上どのtyped errorへ分類したかをtable testと`impl.md`で追跡すること。
- wire schemaへOffer/Answer/candidateのrevisionとrequest IDが明記され、依存backend taskの契約と整合した。
- comment auditは所定9列、change comprehension surface、rewrite/delete、省略条件、TODO、評価時FAIL条件まで
  受け入れ条件化された。`RTCTalkClient`、parser/helper、retry/state/lifecycle flowを対象から漏らさないこと。
- `documents/design/contracts/frontend-rtc.md` と `documents/design/index.md` の同期を同じ変更で行うこと。
