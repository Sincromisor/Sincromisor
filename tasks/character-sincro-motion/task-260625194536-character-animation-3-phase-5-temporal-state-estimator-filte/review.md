# Review: task-260625194536-character-animation-3-phase-5-temporal-state-estimator-filte

## 判定

APPROVED

前回の blocking High だった `TemporalPartMeta` 生成規則と `ReliabilityMap` 集約規則は、受け入れ条件として一意に固定された。classification hysteresis と invalid dt / lost frame の filter 扱いも実装・テスト可能な期待値になっており、改訂で新たな破綻は見つからない。

## 指摘事項

なし

## 実装者への申し送り

- `TemporalPartMeta` は `task.md:22` の規則に従うこと。特に `stateAgeMs` / `observedAgeMs` は `mediaTimeMs` 差分だけで更新し、tracked / suspect は `source: "canonical"`、lost は `source: "neutral"` に固定する。
- reliability 集約は `task.md:20` の通り、arm part と shoulder / elbow / wrist joint の最悪 state を使う。既存 `ReliabilityMap` は `predicted` / `recovering` も許容するため（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:5`-`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:11`）、本タスクではそれらを temporal 出力の `"suspect"` に downcast する。
- classification hysteresis は「候補分類が `confidence >= 0.35` で 160ms 以上連続して同じ値だった場合だけ更新」と読む。初回 frame / `reset()` 後に前回 classification が無い場合は、依存 contract の default factory と矛盾しない初期値を使い、unit test で固定すること。
- invalid dt と lost frame では filter 内部状態を更新しない。`dtMs <= 0`、`dtMs > 250`、非 finite dt は前回 filtered 値を維持して velocity 0 と `out_of_range` warning、lost frame は canonical の低信頼値を filter に投入せず state/meta だけ更新する。
- ドキュメント同期は `task.md:27` と `task.md:68` に明記済み。実装時は threshold、reliability 集約、age / warning、filter 初期値、prediction/recovering を後続へ残す責務境界を `documents/design/frontend/character/motion.md` に反映すること。
