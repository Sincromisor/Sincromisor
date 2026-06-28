# Implementation Log: task-260628200308-character-animation-3-0-phase-12-motion-intent-estimator-spl

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- `motionIntentEstimator.ts` は既存 import 互換の public class / factory / 公開型 re-export の入口として残しつつ、全体 update orchestration だけを持たせた。side memory の hysteresis / cooldown / semantic hold / candidate stabilization は `motionIntentSideMachine.ts` へ分離した。
- `MOTION_INTENT_SCHEMA_VERSION` と `parseMotionIntentState()` を含む `motionIntentState.ts` は変更しなかった。保存 contract の schema 変更は混ぜていない。
- detector と state machine を分け、gesture / near-face / wave / clap-like / guarded / side-swap warning の観測判定と、安定化・hold・cooldown の状態遷移を別 module にした。
- 新規 production module は全て 300 行以下にした。`motionIntentSideMachine.ts` は当初 300 行を超えたため、fallback/global orchestration を facade 側へ戻して 217 行に収めた。
- `documents/design/frontend/character/motion.md` の `src/character/motionIntent` 責務説明に、分割後の module 境界を同期した。

### review.md 申し送り対応

- schema version / parser contract は未変更。
- facade からは既存公開型だけを re-export し、domain-internal helper は責務 module 側に閉じた。テスト都合の facade export は追加していない。
- semantic hold、`sideSwapHoldMs`、wave alternation、warning code、stable duration は既存 `motionIntentEstimator` テストで確認した。

### 確認結果

- `npm run test -- motionIntentEstimator`: PASS
- `npm run test -- semanticMotionPoseLayer`: PASS
- `npm run test -- fingerCurlPoseLayer`: PASS
- `npm run build`: PASS
- `npm run check`: PASS
- `npm run tasks:check`: PASS。worktree root に `node_modules` が無く `yaml` import で一度失敗したため、main checkout の root `node_modules` への一時 symlink を作って再実行した。symlink は gate 後に削除済み。
- `npm run tasks:check:frontend-structure`: FAIL。出力された strict target 29 件はいずれも今回追加・変更した `motionIntent` module ではなく、feature branch 上の既存 300 行超ファイル。今回変更した `motionIntent` production module は最大 239 行。
- `npm run gate`: PASS。commit `2123040309b034e517975710b535d9e468849b82` の clean worktree で lint / build / full test が PASS。

### 残リスク

- 挙動変更を意図しない分割だが、既存テストが観測しない内部 wiring の取り違えリスクは残る。現時点では focused tests と full gate は緑。

## attempt 2

### 判断

- 評価 FAIL の指摘どおり、`motionIntentEstimator.ts` に残っていた fallback candidate 判定と `fallbackCandidateStartedAtMs` / `fallbackStableDurationMs` の state 更新を facade から移動した。
- fallback の純粋判定は `detectMotionFallbackCandidate()` として `motionIntentCandidateDetectors.ts` に置いた。torso confidence と左右 arm low/lost の組み合わせだけを見て candidate boolean を返す。
- fallback duration / stabilization state は `MotionIntentSideMachine.updateFallbackCandidate()` に移した。`MotionIntentEstimator.update()` は media time / dt / global detector 結果を組み立て、side machine へ委譲する orchestration に留めた。
- design doc は `motionIntentSideMachine.ts` の責務に fallback duration を明記し、candidate detector が motion fallback candidate を担当する記述と実装を揃えた。

### 確認結果

- `npm run test -- motionIntentEstimator`: PASS
- `npm run test -- semanticMotionPoseLayer`: PASS
- `npm run test -- fingerCurlPoseLayer`: PASS
- `npm run check`: PASS
- `npm run build`: PASS
- `npm run tasks:check`: PASS。attempt 1 と同じく worktree root の `node_modules` 不在を補うため、一時的に main checkout の root `node_modules` symlink を作成して実行し、削除済み。
- `npm run tasks:check:frontend-structure`: FAIL。今回変更した `motionIntent` files は全て 300 行以下で、出力された 29 件は既存の非 `motionIntent` strict target。
- `npm run gate`: PASS。commit `63295da2471fc7f5a8e0bd8c353911a0a2a7c17e` の clean worktree で lint / build / full test が PASS。

### 残リスク

- fallback の責務境界は評価指摘に沿って修正済み。挙動は既存 estimator fallback test と full gate で確認したが、fallback state を side machine へ移したため、未テストの edge case では wiring 回帰の余地はわずかに残る。
