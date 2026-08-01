# Review: task-260802032857-pion-phase-3-session-lifecycle-readiness

## 判定

APPROVED

前回の High 指摘はすべて解消され、状態遷移、依存注入、close deadline、comment acceptance の期待値が一意になった。
改訂箇所に実装を止める新たな破綻はない。

## 指摘事項

なし。

## 実装者への申し送り

- 許可遷移、event source、競合時のmutex先着、closing後のno-op、重複mediaのclose方針が確定した。
  typed transition errorは、運用判断を行う境界で既存のstructured logging方針に従って一度だけ記録すること。
- `Clock` / `Timer` と `ManagerDependencies` の最小契約、Coordinator生成経路、nil/zero拒否が確定した。
  fake clockでは `Timer.Stop` と発火callbackの競合もrace testへ含めること。
- `Session.Close` は非blocking、`closed` / `done` / registry removeは全resource join後、
  `Manager.CloseAll(ctx)` のdeadline時もcleanup継続という契約を維持すること。
- 前回指摘した同種track / DataChannelの重複は `duplicate_media` closeとして解消された。
  同一object/stateの重複no-opと別objectの拒否を別caseで検証すること。
- comment acceptanceは、change comprehension surface、rewrite/delete、省略条件、TODO、新規symbol、
  evaluatorの照合とFAIL条件まで補完されている。
