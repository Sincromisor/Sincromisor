# Evaluation: task-260625035438-character-animation-3-phase-4-reliability-contract

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `reliabilityMap.ts` の追加と required export — `3d4e885` で `RELIABILITY_MAP_SCHEMA_VERSION`、`ReliabilityMap`、`ReliabilityPartState`、`ReliabilityReasonCode`、`ReliabilityWarningCode`、`JointReliability`、`PartReliability`、`GestureReliability`、`ReliabilityMapParseResult`、`parseReliabilityMap()`、`createDefaultReliabilityMap()` を export している。
- [✓] JSON 保存可能な plain object contract と rejection 方針 — Zod schema は finite number / strict object / plain object guard を使い、class instance、extra key、未知 enum、NaN / Infinity を reject する。未知 `schemaVersion` は先行判定で `unknown_schema_version`、score / weight 等の値域違反は `out_of_range`、構造違反は `invalid_state` になる。
- [✓] `ReliabilityPartState` lower-case enum 固定 — `"tracked" | "suspect" | "predicted" | "lost" | "recovering"` に固定され、保存境界へ大文字 enum を持ち込んでいない。
- [✓] `finalWeight` と component score の `0..1` finite 固定 — `scoreSchema` により `0..1` の finite number のみ許可し、テストで低 weight `0.1` が parse 成功として保持されることを確認している。
- [✓] 保存 schema shape 固定 — `timestamp`、`camera`、`joints`、`parts`、`gesture`、`warnings` は task.md の TypeScript shape に沿って実装され、joint / part は `.object({ ... }).strict()` 展開で未知 key を許可しない。
- [✓] `createDefaultReliabilityMap(mediaTimeMs)` — `timestamp.mediaTimeMs`、camera 初期値、全 joint / part の `lost` / `finalWeight: 0` / component `score: 0` / `no_observation`、gesture 初期値が task.md の指定どおり生成される。
- [✓] parse unit test — valid object、未知 schema、非 finite number、`finalWeight` 範囲外、未知 enum、extra key、未知 reason / warning code、class instance rejection を `reliabilityMap.test.ts` で確認している。
- [✓] ドキュメント同期 — `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に ReliabilityMap v1、`frame.reliability` optional slot、低 weight 観測を破棄しない方針、parse error 方針が同期されている。

## テスト結果

- 実行コマンド: `npm run gate`（評価用 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-3d4e8850167c-Phr90F`、clean HEAD `3d4e885`）
- 結果: PASS
    - `gate:lint` CACHE HIT — frontend lint/format and Markdown check
    - `gate:build` CACHE HIT — frontend type check and build
    - `gate:test` CACHE HIT — frontend tests, 111 passed
- カバレッジ評価: task.md の parse / schema / default factory 条件に対して focused unit test があり、gate の全体テストも通過している。estimator 接続や debug UI 接続は明示的にスコープ外のため、追加 acceptance test は不要と判断した。

## ドキュメント整合性

- 変更は frontend 内部の保存 contract / debug replay contract に関わるが、公開 WebRTC / backend / compose / env 契約は変更していない。
- 必要な同期先である `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` は同じ差分で更新済み。未同期ドキュメントは見つからない。

## 残課題（FAIL の場合）

- なし。
