# レビュー: task-260802212216-pion-gate3-pipeline-contract-harness

## 判定

APPROVED

前回の重大指摘2件は、現行 production の履歴確定タイミングに沿う段階別期待値と、Consul 操作ごとの有限 error 分類へ改訂されて解消した。改訂箇所に新たな破綻はなく、実装を妨げる指摘はない。

## 指摘事項

- なし。

## 実装者への申し送り

- 障害 attempt 後の履歴は、Recognizer confirmed で user が追加され、Processor final で response history が確定する現行順序に従う。`task.md:116-131` の3行を case と action の全組合せで厳密に照合し、Processor final 未到達時に assistant 履歴を生成しないこと。
- Consul の readiness、登録、rollback、終了処理は `task.md:64-90` の操作別 sentinel を正本とする。元失敗と cleanup 失敗が併発する試験では、元 sentinel と `ErrCleanup` の両方に `errors.Is` が成立することを確認する。
- 接続数行列は production client の Extractor → Recognizer → Processor → Synthesizer の直列接続順に基づく。503 拒否を accepted / closed に含めず、部分 set の cleanup と再試行後の active 接続を分けて集計すること。
- 依存タスクの `process.Owner` は完了済みであり、`Start` 成功後は context を取らない `Close()` が process と background waiter を join する。期限切れ context でもこの cleanup を省略しないこと。
