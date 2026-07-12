# Dry run VrmPoseComposer in production sincro

## 背景 / 目的

`VrmPoseComposer` は実装済みだが、本番 `VRMCharacterManager.update()` では呼ばれていない。実適用前に live `sincro` frame で composer input / output を作り、旧 direct bone write と並行して観測できる dry-run 経路が必要である。

本タスクでは composer を production runtime で dry-run し、`finalPose` / `ownedBones` / `suppressedLayers` / `warnings` を observe-only state と Debug Console に出す。`setNormalizedPose()` は呼ばない。

## 完了条件（受け入れ条件）

- [ ] production runtime で `composeVrmPose()` を呼ぶ dry-run service を追加し、入力は latest `SincroPoseRetargetFrame`、`AvatarMotionProfile` / `MinimalAvatarMotionProfile`、optional previous dry-run final pose、`deltaSeconds` に限定する。
- [ ] dry-run service の追加先は `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts` に固定し、`SincroVrmPoseComposerDryRunService`、`SincroVrmPoseComposerDryRunInput`、`SincroVrmPoseComposerDryRunResult`、`reset()`、`compose()` を export する。
- [ ] `SincroVrmPoseComposerDryRunResult` は `{ status: "available" | "not_ready" | "invalid_input" | "missing_profile"; result?: VrmPoseComposerResult; warnings: string[] }` に固定する。`status !== "available"` の場合は `result` を返さない。
- [ ] dry-run result は `SincroMotionPipelineState.composerDryRun` に保存し、Debug Console summary で `available` / `not_ready` / `invalid_input` / `missing_profile` を区別する。
- [ ] dry-run は `vrm.humanoid.setNormalizedPose()`、normalized bone node の `rotation` / `quaternion`、expression、root position を一切変更しない。
- [ ] `VRMCharacterManager.update()` の既存 controller 呼び出し順序と `vrm.update(deltaSeconds)` の位置を変更しない。
- [ ] tracking / idle / semantic / finger layer のうち、本タスクで生成するのは tracking layer と fallback layer だけに固定する。semantic / finger は後続適用対象であり、存在しても dry-run input に混ぜない。
- [ ] missing optional bone、zero weight、quaternion normalize、angular velocity clamp の warning / suppressed layer が live summary で確認できる。
- [ ] production TypeScript comment audit を実施し、dry-run が適用しない不変条件、previous pose lifecycle、fallback reason の保守コメントを必要箇所へ追加する。
- [ ] `impl.md` に comment audit table を記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、対象は dry-run service public export、`status` enum、previous final pose lifecycle、`setNormalizedPose()` を呼ばない不変条件、tracking / fallback layer 限定判断、missing profile fallback を必ず含める。
- [ ] audit の `decision` は `keep` / `rewrite` / `delete` / `add` に限定する。弱い既存コメント、実装と矛盾した stale comment、名前・型から分かるだけのコメントは `rewrite` または `delete` にする。コメントを省略する場合は省略理由を audit に書く。TODO を追加する場合は理由、削除条件、canonical task ID、判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- dry-run は `VRMCharacterManager` から近い場所で実行する。`TrackerRuntime` 側では VRM profile と retarget frame が無いため採用しない。
- dry-run service は `src/character/runtime/sincroVrmPoseComposerDryRun.ts` に置く。`vrmCharacter/` に置く案は manager 専用実装に閉じやすく、motion-debug / replay から再利用しにくいため採用しない。
- input layer は tracking / fallback に限定する。semantic / finger を混ぜると dry-run の目的が「旧 retarget と composer 基本合成の比較」からぶれるため採用しない。
- result は live state に保存し、motion-debug log への永続保存は本タスクの必須にしない。recording 接続は別 task で扱う。

## スコープ境界

- 本タスクでやること: production dry-run 呼び出し、state / Debug Console summary、単体テスト。
- 本タスクでやらないこと: VRM 適用、semantic / finger layer 入力、baseline 比較、feature flag 適用。
- 依存タスクとの境界: observe-only task が state を提供する。本タスクは composer result をそこへ追加する。

## 実装方針（既存コード整合: file:line）

- `VRMCharacterManager.update()` は retarget frame を作り、Debug Console に渡してから controller を更新している（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:201`、`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:213`）。
- `SincroPoseRetargeter.attachVrm()` は `AvatarMotionProfile` を作成済みである（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:82`）。
- `composeVrmPose()` は `VrmPoseComposerInput` から plain result を返す pure function である（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:48`）。
- 設計文書は composer v1 を developer-only path とし、本番書き込み順序を変更しないとしている（`documents/design/frontend/character/motion.md:172`）。

## テスト

- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`
- `cd sincromisor-frontend && npm run test -- vrmCharacterManager`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。production runtime に composer dry-run という developer-visible 状態を追加するため、`documents/design/frontend/character/motion.md` に dry-run の入力、非適用の不変条件、後続 feature flag への導線を同期する。
