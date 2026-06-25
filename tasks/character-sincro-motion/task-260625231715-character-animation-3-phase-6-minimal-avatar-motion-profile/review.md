# Review: task-260625231715-character-animation-3-phase-6-minimal-avatar-motion-profile

## 判定
APPROVED

Critical / High の blocking 指摘はない。schema、配置、fallback、テスト、ドキュメント同期が task.md 内で具体化されており、既存コードの前提も確認した範囲で現状と整合している。

## 指摘事項
なし

## 実装者への申し送り
- `SincroPoseRetargeter.attachVrm()` の現行境界は `sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:76` で、Debug Console / motion-debug は `DebugConsoleSnapshot["sincroMotion"]` と `MotionDebugSnapshot.poseRetargetRuntime` を共有している。task.md は `getter または snapshot field` としているが、ドキュメント同期では debug snapshot 追加を前提にしているため、少なくとも snapshot 経由で観測できる形に寄せるのがよい。
- 腕長 / 肩幅は `sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:125` 以降で world position distance を `Math.max(..., 0.04 / 0.08)` している。profile 側も同じ normalized bone node、同じ `updateMatrixWorld(true)` 前提、同じ fallback とし、丸めを新規に入れないこと。
- missing bone の warnings は後続タスク・replay・debug 表示から読む contract になるため、reason code は固定文字列として重複なく出すこと。`head_size_estimated_from_shoulder_width` は task.md で明示済みなので、他の欠損 reason もテストで期待値を固定すること。
- `documents/design/frontend/character/motion.md` には v1 schema だけでなく、Phase 6 では IK / retarget の計算結果を変更しないこと、完成版 `AvatarMotionProfile` と calibration UX は Phase 7 に残すことを明記すること。
