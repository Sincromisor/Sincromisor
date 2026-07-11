# Review: task-260705214026-canonical-temporal-arm-solver-production

## 判定

APPROVED

前回 High は解消された。temporal / profile 欠損時は存在する値を保持し、欠損 field だけ `undefined` にする方針へ改訂され、fallback reason を個別に検証できる。今回改訂による新たな blocking 破綻は見当たらない。

## 指摘事項

なし

## 実装者への申し送り

- 前回指摘の provider 所在、`retarget(snapshot, nowMs, options?)` signature、`VRMCharacterManager.update()` からの temporal / profile 受け渡し、Phase 6 `source` optional field、`sincro.phase6-solver.v1` 維持、旧 log parse success 方針は task.md に追記済み。
- `VRMCharacterManager.update()` は存在する `temporal` / `profile` をそのまま第 3 引数へ渡し、欠損 field だけ `undefined` にすること。provider 側の入力型もこの受け入れ条件と矛盾しないよう、欠損原因を個別に扱える形にすること。
- `createTemporalArmIkInput()` 自体は `temporalArmSolverBridge.ts:43` から `:60` の入力 contract と `:98` から `:109` の target / reason 出力があり、production primary の候補として使える。
- `documents/design/frontend/character/motion.md:360` から `:366` は temporal bridge を本番切替前の helper として説明し、`:492` から `:496` は現状 arm IK target を pose wrist 正本としている。docs sync ではここを temporal primary / pose fallback に変えること。

## Freshness check (2026-07-12)

### 判定

FRESH

基準 SHA `5299bb3fb6f7fa4675b700835e450d73cfb4e9d2` 以降、full normalized pose の production default 化、段階的 rollback path の削除、gesture reliability / raw replay / motion-debug viewer 分割が入ったが、本タスクの主要前提である `SincroPoseRetargeter.retarget(snapshot, nowMs)` の Pose snapshot arm 入力、`createTemporalArmIkInput()` の contract、`SincroMotionPipelineState.temporal`、Phase 6 v1 snapshot contract は維持されている。production temporal arm provider と runtime 第 3 引数はまだ未実装であり、受け入れ条件は引き続き実装可能である。

### 実装者への追加申し送り

- task.md の file:line は古い。現在の主な位置は `sincroPoseRetargeter.ts:96`（`retarget`）、`:117` / `:123`（左右 `retargetPoseArm`）、`vrmCharacterManager.ts:287`（retarget 呼び出し）、`motionDebugPhase6Snapshot.ts:18`（schema version）、`:42` 前後（arm snapshot）、`:165` 前後（parser）を起点に再検索すること。
- `VRMCharacterManager.update()` は後続タスクにより full `VrmPoseComposer` application が唯一の upper-body final pose writer になった。temporal primary への切替は retarget/composer input を変更するが、削除済みの `ArmBoneController` / torso staged writer や rollback flag を復活させないこと。
- `documents/design/frontend/character/motion.md` の旧 `:492-496` にあった Pose wrist 正本の記述は、後続の docs rewrite でその位置から消えている。現在は `:469` 以降の Production Application Gates と `:478-484` の ownership 境界を維持しつつ、motion-debug の Phase 6 説明（現在 `:433-455` 付近）と IK policy 周辺へ temporal primary / pose fallback を同期すること。
- `toMinimalAvatarMotionProfile()` は現在 `vrmCharacterManager.ts:216-219` で Debug Console profile 更新にも使われている。retarget 第 3 引数用の変換を追加する際は既存 profile 取得を共有してもよいが、task.md の指定どおり temporal / profile の存在を独立に保ち、片方の欠損で両方を `undefined` にしないこと。
- 基準 SHA 以降に motion-debug viewer の solver layer と raw replay schema が追加されている。Phase 6 `source` optional field の parser / legacy 表示対応では、`motionDebugViewerSolverLayer.ts` とその tests を追加の同期先として確認すること。
