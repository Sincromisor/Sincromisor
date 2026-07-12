# Review: task-260625035438-character-animation-3-phase-4-downstream-weights

## 判定

APPROVED

判定理由: 前回の blocking 指摘は解消済み。retarget / IK は本タスク外、reason 読み取り元は `ReliabilityReasonCode` の `components.*.reasonCodes`、確認先は `MotionDebugSnapshot.canonicalReliabilityInput` に固定され、実装成果物とテスト期待値が一意になった。

## 指摘事項

なし。

## 実装者への申し送り

- 本タスクは canonical confidence / source / warnings と motion-debug developer state への reliability 伝播に限定する。`CharacterBehaviorState.applyPoseMotion()` / `SincroPoseRetargeter` の入力 contract、`SincroPoseMotionSnapshot` の `ikWeight`、IK solver weight は変更しない。
- canonical warnings への変換は `ReliabilityWarningCode` ではなく、該当 arm の part / joint `components.side.reasonCodes`、`components.boneLength.reasonCodes`、`components.bodyScale.reasonCodes` を読む前提で実装する。
- 使用 weight の観測先は `MotionDebugSnapshot.canonicalReliabilityInput` に固定されている。最低限 `leftArm.partWeight`、`leftArm.minJointWeight`、`rightArm.partWeight`、`rightArm.minJointWeight`、`schemaVersion`、`mediaTimeMs` を JSON で確認できるようにする。
