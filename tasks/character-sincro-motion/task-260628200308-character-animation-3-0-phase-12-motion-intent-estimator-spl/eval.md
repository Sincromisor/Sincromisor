# Evaluation: task-260628200308-character-animation-3-0-phase-12-motion-intent-estimator-spl

## 判定
PASS

## 受け入れ条件チェックリスト
- [✓] 既存 import 互換の facade 維持 — `motionIntentEstimator.ts` は `MotionIntentEstimator`、`createMotionIntentState()`、既存公開型 `GestureIntentObservation` / `IntentTimingConfig` / `MotionIntentEstimatorConfig` / `MotionIntentEstimatorInput` の re-export を維持している。facade からの追加 internal export はない。
- [✓] 指定 module への責務分割 — config / types / side state / global detector / candidate detector / side machine が分割済み。前回 FAIL 点だった fallback candidate 判定は `motionIntentCandidateDetectors.ts` の `detectMotionFallbackCandidate()`、`fallbackCandidateStartedAtMs` / `fallbackStableDurationMs` の状態更新は `motionIntentSideMachine.ts` の `updateFallbackCandidate()` に移動しており、facade には active / duration の委譲だけが残っている。
- [✓] 新規 production module 300 行以下 — `wc -l` で `motionIntentEstimatorTypes.ts` 125 行、`motionIntentEstimatorConfig.ts` 219 行、`motionIntentSideState.ts` 150 行、`motionIntentCandidateDetectors.ts` 259 行、`motionIntentGlobalDetectors.ts` 98 行、`motionIntentSideMachine.ts` 246 行。例外コメント不要。
- [✓] `MotionIntentEstimator.update()` の既存挙動維持 — `npm run gate` の full test 405 passed と、focused `npm run test -- motionIntentEstimator` 15 passed で warning code / cooldown / stableDurationMs / semantic hold / fallback / wave alternation を確認した。
- [✓] `MOTION_INTENT_SCHEMA_VERSION` と `parseMotionIntentState()` contract 不変 — `motionIntentState.ts` に差分なし。
- [✓] public class の入力境界コメント — `MotionIntentEstimator` 直前の TSDoc で temporal / reliability / hand / optional gesture を入力境界とし、VRM bone / Three.js runtime object / MediaPipe raw result を読まないことを明記している。
- [✓] 非自明な gate のコメント — gesture confidence と手・指信頼度 gate、side swap hold、wave alternation に日本語コメントがある。
- [✓] テスト都合だけの facade export なし — facade からは既存公開 API だけを export。責務 module の helper / 型 export は cross-module wiring 用で、facade re-export されていない。
- [✓] design doc 同期 — `documents/design/frontend/character/motion.md` の `src/character/motionIntent` 責務説明に分割後の module 境界が追記され、fallback candidate / fallback duration の配置も実装と一致している。

## テスト結果
- `git diff --check HEAD~2..HEAD`: passed。
- `npm run gate`: passed。評価 worktree の clean HEAD `63295da` で cache hit。`gate:lint` passed、`gate:build` passed、`gate:test` passed。test summary は 405 passed。
- `npm run test -- motionIntentEstimator`: passed。1 file / 15 tests passed。
- `npm run tasks:check:frontend-structure`: failed。29 strict target file(s) exceed 300 lines。ただし出力された strict target はいずれも今回変更された `motionIntent` module ではなく、現行 feature branch の既存超過。今回変更 file の最大は `motionIntentCandidateDetectors.ts` 259 行。
- `npm run tasks:check`: 初回は評価 worktree root の `node_modules` 不在により `yaml` import 解決で failed。main checkout の root `node_modules` への一時 symlink を作成して再実行し passed（212 tasks / open=4 / done=208）。symlink は削除済みで worktree は clean。
- カバレッジ評価: 既存 `motionIntentEstimator.test.ts` は wave 未成立 / 成立、side-local cooldown、gesture mapping、nearFace / clapLike / guarded、low hand reliability、ReliabilityMap 欠損、semantic hold、fallback、invalid dt、one-shot helper、side swap suspicion を確認している。今回の分割は挙動追加ではなく責務移動であり、受け入れ条件に対する回帰検出として十分。

## ドキュメント整合性
- 公開 WebRTC / backend 契約変更なし。`MOTION_INTENT_SCHEMA_VERSION` / `parseMotionIntentState()` の保存 contract 変更なし。
- `documents/design/frontend/character/motion.md` は module 境界を同期済み。candidate detector が gesture / near-face / wave / motion fallback の candidate 生成を担当し、side machine が side memory / semantic hold / cooldown / fallback duration / candidate stabilization を担当する記述は実装と一致している。

## 残課題（FAIL の場合）
- なし。
