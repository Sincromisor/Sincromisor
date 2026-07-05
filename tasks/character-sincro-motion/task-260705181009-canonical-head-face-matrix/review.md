# Review: task-260705181009-canonical-head-face-matrix

## 判定
APPROVED

前回の High 指摘 2 件は、ReliabilityMap の反映式・lost 条件・comment acceptance が受け入れ条件として一意に追記されており解消済み。改訂箇所に、実装を止める新たな破綻は見当たらない。

## 指摘事項
なし。

## 実装者への申し送り
- `task.md:17` で head reliability は `parts.head.finalWeight` と `joints.head.finalWeight` の両方を使う式に固定済み。既存 `ReliabilityMap` には `parts.head` / `joints.head` が存在する（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:166`、`:173`、`:174`）。
- `task.md:15` で invalid matrix の Euler fallback、warning、confidence clamp、Euler も非 finite の場合の head 省略が一意化されている。`task.md:20` で head warnings の top-level 集約も固定済み。
- `task.md:24` の comment acceptance は audit 記録だけでなく、public export / parser / observe-only boundary / fallback heuristic の実コードコメントまたは省略理由まで確認対象にしている。実装時は `impl.md` の audit と実コードの両方が対応していることを確認する。
- `extractCanonicalHeadState()` input に optional previous head は含まれるが、`task.md:15`、`:16`、`:31` で fallback 値として previous を使わない方針が明記されている。実装では Temporal 側の dropout / predicted 責務と混ぜないこと。
