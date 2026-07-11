# Review: task-260712044931-expose-calibration-retry-ui

## 判定
APPROVED

前回残った state 不変条件と action の session identity 契約は、状態別 union と sessionId 付き discriminated union により解消された。改訂に起因する新たな blocking 問題はない。

## 指摘事項
- なし。

## 実装者への申し送り
- lifecycle event owner が cancel する際も、active state の `sessionId` を `{type:"cancel", sessionId, reason}` に渡すこと。
- idle/cancelled に `currentStep` / `session` を持たせず、stale/inactive/already_active の非 mutation を state tests で固定すること。
