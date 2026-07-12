# Review: task-260712171317-capture-m1-macbook-air-motion-validation-suite

## 判定

APPROVED

## 再レビュー結果

前回のblocking 3件はすべて解消された。

### 1. metrics式・母集団・FAIL責務

解消済み。

- Gesture gateの母集団はon/offともbaseline 9 segmentだけに固定され、追加suiteを除外している。
- duration、frameCount、半開区間、conflict合計、flicker/min、degradationRate、frameCount 0の扱いが一意である。
- neutral false-positiveのframe寄与、最終frame、timestamp異常、Gesture missingの扱いまで定義されている。
- 全gate PASS時のrollback evidenceと、超過・invalid時のFAIL、frame range・再現条件・後続task候補の記録責務が
  明示されている。

### 2. 後続rollback taskとの依存・artifact path

解消済み。

- 旧baseline taskは`status=superseded`、`superseded_by`は本タスクである。
- rollback taskの`depends_on`とtask本文は本タスクを参照する。
- rollback開始条件は本タスクの`artifacts/metrics.json`と`artifacts/verdict.md`に同期されている。

### 3. private原本の評価受け渡し・欠損判定

解消済み。

- main checkoutのprivate root絶対pathをevaluatorへ明示し、評価worktreeからread-only参照する契約になった。
- 全採用原本から独立再計算し、欠損・hash不一致・read不可は実装段でblocked、評価開始後はFAILとなる。
- 公開summaryやhashだけによる再計算代替を禁止している。

## 実装・評価への申し送り

- manifestはrecording/videoをfile単位の別entryとして持つため、期待時間515秒の確認では両sourceKindを単純合算して
  1030秒にしないこと。protocolの一意なsegment集合ごとに期待時間を数え、各segment/sourceKindでは唯一の
  `accepted=true` entryを確認する。
- Gesture gateは追加suiteを含めず、on/offそれぞれbaseline 150秒の採用範囲だけで再計算する。
- private rootの絶対pathは公開manifestへ保存せず、評価実行時の受け渡し情報としてのみ扱う。

## Summary for Parent

APPROVED。前回の3 blockingは解消済み。改訂に新たなblocking破綻はない。実装時はfile単位manifestの
recording/videoを重複加算せず、515秒を一意なprotocol segment集合で確認すること。
