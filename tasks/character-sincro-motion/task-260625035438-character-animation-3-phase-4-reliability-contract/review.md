# Review: task-260625035438-character-animation-3-phase-4-reliability-contract

## 判定

APPROVED

前回 blocking だった `ReliabilityMap` v1 保存 schema 未確定は、完全な TypeScript shape、reason / warning code、camera / gesture / parse result 形状の明文化により解消された。前回の `file:line` ずれも現行コードと一致する参照へ修正済みで、改訂による新たな blocking 破綻は見当たらない。

## 指摘事項

なし。

## 実装者への申し送り

- `Record<...>` は task.md の指定どおり zod `.object({ ... }).strict()` へ展開し、未知 joint / part key を許可しないこと。
- `parseReliabilityMap()` は `unknown_schema_version` を詳細 schema validation より先に返し、成功時は `{ ok: true; map: ReliabilityMap }` に固定すること。
- 受け入れ条件の export 一覧には `ReliabilitySource`、`ReliabilityScoreComponent`、`ReliabilityComponentSet`、parse error 型までは含まれていない。実装時に公開名を増やす場合は、後続利用者に必要な最小範囲に留めること。
