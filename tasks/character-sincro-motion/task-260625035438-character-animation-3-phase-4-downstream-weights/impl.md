# Implementation Log: task-260625035438-character-animation-3-phase-4-downstream-weights

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- review.md の指示どおり、reliability の接続先は canonical confidence / source / warnings と `MotionDebugSnapshot.canonicalReliabilityInput` に限定した。`CharacterBehaviorState.applyPoseMotion()`、`SincroPoseRetargeter`、`SincroPoseMotionSnapshot.ikWeight`、IK solver weight は変更していない。
- canonical warning 変換は `ReliabilityWarningCode` ではなく、該当 arm の part / joint `components.side.reasonCodes`、`components.boneLength.reasonCodes`、`components.bodyScale.reasonCodes` だけを読む実装にした。
- replay 経路は `updateReplayReliability()` を `updateReplayCanonical()` より先に呼ぶ順序へ変更した。saved replay reliability が invalid の場合は `latestValidReliability()` が `undefined` になるため、canonical 再生成には reliability 未指定として渡る。
- `MotionDebugRecordingController` では fallback の `createDefaultReliabilityMap()` は記録 slot 用に残し、canonical 生成へは呼び出し元から渡された valid reliability だけを渡す。reliability 未指定時の canonical 旧挙動を保つため。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に Phase 4 の downstream 接続範囲、downweight 式、lost / suspect の扱い、reasonCodes から canonical warnings への変換、retarget / IK solver weight が Phase 5 / 6 以降であることを追記した。

### 確認

- `cd sincromisor-frontend && npm run test -- canonicalArmFeatureExtractor motionDebugCanonicalState motionDebugViewerModel`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS

### 未確認 / 残リスク

- ブラウザ上の motion-debug 実機 UI 操作は未実施。今回の変更は window API snapshot / canonical 計算 / replay 順序に閉じ、UI slot 追加はスコープ外。

### 最終コミット / post-commit gate

- 実装コミット: `5d53d37` (`feat(character): propagate reliability to canonical arms`)
- `npm run gate` を commit `5d53d37` の clean worktree で再実行し、lint / build / test が PASS。
