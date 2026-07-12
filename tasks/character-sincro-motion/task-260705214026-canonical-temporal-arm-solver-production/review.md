# Review: task-260705214026-canonical-temporal-arm-solver-production

## 判定

APPROVED

既存の巨大タスクから solver reach / clamp 品質と deterministic recovery QA を後続 2 task へ分離した結果、本タスクは production temporal primary への切替、fallback / debug provenance、実写 comparison artifact の保存という integration 責務に収束している。後続タスクとの境界、blocking とする条件、設計文書同期、TypeScript production comment audit も受け入れ条件として検証可能に定義されており、実装着手を妨げる欠落はない。

## Critical / High 指摘

なし。

## チェック結果

- temporal / profile の欠損を独立に保持し、`temporal_input_missing` と `avatar_profile_missing` を個別記録するため、runtime 境界の期待値は一意である。
- bridge の既存 contract は `target` の有無と `invalid_temporal_arm` / `temporal_arm_lost` を返せるため、temporal primary と Pose snapshot fallback の分岐を実装・テストできる。
- Phase 6 の `source` は optional field として最小 schema が固定され、旧 `sincro.phase6-solver.v1` の parse success と legacy 表示まで条件化されている。
- 実写 comparison は integration evidence として必要だが、reach / clamp 非回帰と deterministic recovery fixture の完成は本タスクの exit gate に含めないことが明記されている。後続 `task-260712033923-temporal-arm-reach-clamp-semantics` と `task-260712033924-temporal-arm-recovery-qa-fixture` も存在する。
- production TypeScript 変更に対する symbol / decision 単位の comment audit schema、実コード上の comment acceptance、stale comment / TODO / rewrite-delete 条件が含まれている。
- developer-visible な motion pipeline の変更に対し、`documents/design/frontend/character/motion.md` と `tracking.md` の同期が受け入れ条件になっている。

## 実装者への申し送り

- `createSincroPoseTemporalArmInput()` では temporal / profile / solver の欠損判定を bridge 呼び出しより前に行い、左右それぞれの `primarySource` と `fallbackReason` が同一 frame 内でも独立に決まることをテストすること。
- `createTemporalArmIkInput()` が返す `reasonCodes` と `sourceState` を source snapshot の `bridgeReasonCodes` / `temporalState` へ欠落なく写し、`target` が無い場合だけ Pose snapshot fallback に落とすこと。
- legacy viewer 対応は parser だけで終えず、現在の solver layer / viewer tests も確認し、`source` 欠損を `pose-snapshot-fallback` 相当として表示すること。
- `VRMCharacterManager.update()` では既存の full normalized pose application と composer ownership を維持し、過去の段階的 writer や rollback 経路を復活させないこと。
- 実写 artifact で regression または比較不能が判明した場合は、結果を成功扱いに丸めず `impl.md` に blocking reason と後続 task への引き渡しを残すこと。本タスクの integration 自体が成立しない不具合と、後続へ分離済みの solver 品質課題は区別すること。
