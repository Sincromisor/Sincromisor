# Review: task-260705004405-torso-shoulder-composer-migration

## 判定

APPROVED

前回 blocking だった torso / shoulder feature flag の rollback 条件と TypeScript production comment acceptance は、受け入れ条件と設計判断に明記されている。残る注意点は実装順序・既存パターンへの追従で吸収できるため、実装に進めてよい。

## 指摘事項

- なし

## 実装者への申し送り

- 依存タスク `task-260705004400-arm-composer-application-hardening` は現時点で `meta.yaml` 上 `status: open`。本タスクの entry criteria は arm flag exit criteria 達成後なので、着手前に依存 close またはオーケストレーター側の着手順を確認すること。
- torso / shoulder flag は既存の `composerArmApplicationMode` と同じく `SincroPoseRetargetConfig`、`VRMCharacterManager.setSincroPoseRetargetConfig()`、Debug Console の pose retarget controls / summary 近傍に置くのが自然。arm flag と共有 enum / mode にせず、flag off で `CharacterMotionTorsoApplier` direct write が必ず残ることをテストで固定すること。
- `VRMCharacterManager.update()` の `HeadBoneController`、`ArmBoneController`、`LegBoneController`、`vrm.update(deltaSeconds)`、`CharacterMotionOrchestrator.update()` の順序は、task.md の指定どおり維持すること。torso / shoulder 適用は selected bone の置換に閉じ、full `setNormalizedPose(finalPose)` へ広げないこと。
- comment audit は `impl.md` の表を埋めるだけでなく、実コード側で public export / boundary / lifecycle / fallback decision の JSDoc/TSDoc 追加・更新、省略理由、stale comment の削除・更新まで照合すること。

APPROVED
