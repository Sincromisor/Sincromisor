# Apply full normalized final pose in production

## 背景 / 目的

arm、torso / shoulder、semantic / finger の段階適用が pass した後、upper body の正本を
`vrm.humanoid.setNormalizedPose(finalPose)` へ統合する。ここで direct bone write と composer write が
混在したままだと二重適用と rollback 困難が残るため、full finalPose application を独立 task として扱う。

## 完了条件（受け入れ条件）

- [ ] arm、torso / shoulder、semantic / finger の exit criteria をすべて満たしていることを task 本文と
      `impl.md` で確認し、未達がある場合は実装に入らず停止する。
- [ ] `VRMCharacterManager.update()` で upper body の composer `finalPose` を 1 回だけ
      `vrm.humanoid.setNormalizedPose(finalPose)` へ渡し、同一 frame の direct bone write と二重適用しない。
- [ ] full application 用 production switch は `fullNormalizedPoseApplicationMode: "off" | "upper_body"` として
      `SincroPoseRetargetConfig` 近傍に追加し、既定値は `"off"` にする。Debug Console の pose retarget controls /
      composer summary 近傍で mode と rollback reason を確認できること。
- [ ] `fullNormalizedPoseApplicationMode: "off"` では full `setNormalizedPose(finalPose)` を呼ばず、
      直前 pass stage の arm / torso / shoulder / semantic / finger 段階別 application 経路へ戻ること。
      off は前段 flag を暗黙に変更しない。
- [ ] head / neck / leg / expression は composer 所有にしない。該当 controller は従来どおり更新され、
      upper body finalPose 適用で意図せず上書きされない。
- [ ] `finalPose` が unavailable / invalid / missing profile の frame では、前回 available finalPose を current result に
      昇格せず、直前の pass stage へ rollback できる。
- [ ] runtime ownership map、composer comparison summary、optional bone fallback verification、full finalPose replay を更新し、
      P0 fixture 全件で motion metrics と composer metrics が pass する。
- [ ] `not_available` metric は artifact 欠損理由付きで gate 判定から除外し、理由なしの pass 扱いにしない。
- [ ] `default.vrm`、`aoi-1.0.7.vrm`、欠損 bone synthetic profile、camera degradation / recovery、
      chat / sincro mode 切替で visual / replay 確認し、
      `artifacts/full-normalized-pose-application-verification.md` に記録する。
- [ ] `documents/design/frontend/character/motion.md`、runtime ownership map artifact、必要に応じて
      `documents/design/frontend/character/overview.md` に、full finalPose 適用境界、非対象 controller、
      rollback 条件、metrics gate を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、
      `symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、
      `action`、`reviewer note` に固定し、最低限 `VRMCharacterManager.update()` の lifecycle、
      `setNormalizedPose(finalPose)` 適用境界、direct write 無効化/残置判断、head / neck / leg / expression 非対象、
      unavailable rollback、owned bone conflict metric、optional bone fallback を含める。
      audit 記録だけでは完了扱いにせず、public export / boundary / lifecycle / heuristic に必要な JSDoc/TSDoc の
      追加・更新または省略理由、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を
      実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- full application は `VRMCharacterManager.update()` に集約する。個別 controller がそれぞれ
  `setNormalizedPose()` を呼ぶ案は、適用順と rollback が追えないため採用しない。
- full application 用 production switch は `SincroPoseRetargetConfig.fullNormalizedPoseApplicationMode` に置く。
  通常設定 UI、URL query、env var、backend API、保存設定 contract には追加しない。既定 `"off"` は直前 pass stage の
  段階別 composer application 経路を維持する safe default とし、`"upper_body"` の時だけ
  `VRMCharacterManager.update()` が full `setNormalizedPose(finalPose)` を 1 回適用する。
- `setNormalizedPose(finalPose)` の対象は upper body finalPose に限定する。head / neck / leg / expression は
  existing controller ownership を維持する。
- unavailable frame では stale finalPose を current result に昇格しない。見た目の連続性を理由に古い pose を
  再適用する案は、gate の rollback 条件と矛盾するため採用しない。
- rollback は `fullNormalizedPoseApplicationMode` を `"off"` に戻し、直前の semantic / finger pass stage へ戻す方式にする。
  前段の arm / torso / semantic / finger flag は、rollback 手順で明示しない限り full application task が暗黙変更しない。
  全面適用後に direct write と composer を同時に有効化する混在 rollback は禁止する。

## スコープ境界

- 本タスクでやること: full `setNormalizedPose(finalPose)` application、direct write 二重適用排除、
  metrics / replay / visual verification、runtime ownership map 更新、docs sync。
- 本タスクでやらないこと: 新しい semantic intent、finger mapping、avatar profile schema の追加、
  backend / WebRTC 契約変更、rollback cleanup での旧コード削除。
- 依存タスクとの境界: `task-260705004410-semantic-finger-production-application` までが段階別適用を安定化する。
  本タスクはそれらを 1 回の normalized pose 適用へ統合するだけで、旧 rollback path の整理は後続 cleanup task に残す。

## 実装方針（既存コード整合: file:line）

- Production Application Gates の full application 条件は `documents/design/frontend/character/motion.md:471` が正本である。
- full application の前提として `documents/design/frontend/character/motion.md:220` の移行ゲートを読む。
- 現行 manager の controller 更新順と `vrm.update(deltaSeconds)` は
  `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:239` から
  `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:267` にある。
- dry-run service は `status !== "available"` で result を持たない contract を
  `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts:21` と
  `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts:49` に持つ。
- full application switch は既存 experimental flag と同じ設定境界に置く。参照先は
  `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:76` と
  `sincromisor-frontend/src/features/debug/react/panels/sincroPoseRetargetControls.tsx:59` の近傍にする。
- pipeline state の clone / composerDryRun 保存契約は
  `sincromisor-frontend/src/character/runtime/sincroMotionPipelineState.ts:46` と
  `sincromisor-frontend/src/character/runtime/sincroMotionPipelineState.ts:79` を維持する。
- runtime ownership map は
  `tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md`
  を更新する。

## テスト

- `sincromisor-frontend/src/character/vrmCharacter/` 周辺に、`setNormalizedPose(finalPose)` が 1 frame 1 回だけ呼ばれ、
  direct upper body bone write が同一 frame で残らないことを検証するテストを追加する。
- `fullNormalizedPoseApplicationMode` の `"off"` / `"upper_body"` 切替で、off は直前 pass stage の application 経路へ戻り、
  前段 flag を暗黙変更せず、mode と rollback reason が Debug Console summary に出ることを検証する。
- unavailable / invalid / missing profile frame で stale finalPose を current result にしないことを dry-run / manager test で検証する。
- P0 fixture replay metrics と composer comparison metrics を実行し、全 metric pass または理由付き除外を artifact に残す。
- `npm run gate` を通す。

## ドキュメント同期の要否

要。production の公開挙動と runtime ownership が変わるため、
`documents/design/frontend/character/motion.md`、runtime ownership map artifact、必要に応じて
`documents/design/frontend/character/overview.md` を同期する。公開 WebRTC / backend 契約は変更しない。
