# Review: task-260627141812-character-animation-3-phase-8-pose-seeded-face-roi-tracking

## 判定

APPROVED

前回申し送りのうち、`options` 最小スキーマ、consistency score 0 のテスト、Worker 実行順の 2 案残りはいずれも task.md 上で解消されている。改訂箇所に新たな Critical / High の破綻はない。

## 指摘事項

なし

## 実装者への申し送り

- `task.md:14` で `detectWithRoi()` の `options` は v1 optional empty object に固定されたため、実装時に新しい設定 field を増やさないこと。
- `task.md:21` で consistency score 0 の Face ROI test が受け入れ条件に追加された。valid ROI だが score 0 の場合に full-frame fallback へ切り替わることを検証すること。
- `task.md:53` で Worker の Pose 実行 frame は Pose -> Face ROI の順に一本化され、同一 frame で FaceLandmarker を二重実行しない方針になった。`TrackerRuntime` main-thread 経路でも、Pose がある frame の ROI Face と Pose 未実行 frame / pose-only fallback 中の full-frame Face 継続を同じ考え方で確認すること。
- `warnings: string[]` は既存互換のため、full-frame 既存経路と stopped snapshot では `warnings: []` に揃えること。
