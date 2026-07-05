# Review: task-260705214907-full-normalized-pose-production-default

## 判定

APPROVED

Critical / High の blocking 指摘はない。default 昇格だけにスコープを絞り、staged fallback 残置、Debug Console 限定境界、docs / artifact 同期、TypeScript production comment audit が受け入れ条件に含まれている。

## 指摘事項

なし

## 実装者への申し送り

- 現行 default は `sincroPoseRetargetTypes.ts:173` から `:176` で `fullNormalizedPoseApplicationMode: "off"`。本タスクではこの default を `"upper_body"` に変えるが、`composerArmApplicationMode` / `composerTorsoShoulderApplicationMode` / `composerSemanticFingerApplicationMode` は削除しないこと。
- `VRMCharacterManager.update()` は `vrmCharacterManager.ts:314` から full application を実行し、success 時は `:323` から `:333` の arm direct writer と `:357` から `:370` の torso / shoulder writer を呼ばない。fallback path は後続削除 task まで維持すること。
- 現行 design は `documents/design/frontend/character/motion.md:541` から `:558` で既定 `"off"` と staged rollback を説明している。docs sync では default `"upper_body"` と staged rollback 残置を同時に更新すること。
- cleanup inventory では full application 常時有効化が follow-up candidate になっている。実装後は同 artifact に default 昇格済みの状態と、staged rollback 削除 task への残条件を同期すること。
