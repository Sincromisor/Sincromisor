# TASK-260517024505 Sincro VRM 3D Two-Bone IK Solver

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-260517024504`

## 目的

MediaPipe の 3D pose target を使い、VRM normalized bones に対して上腕・前腕の本格的な two-bone IK を適用する。

現在の簡易 IK は screen-space の方向量を Euler 回転へ変換する近似であり、手首 effector の到達位置を solver として満たしていない。本タスクでは `SincroPoseRetargeter` の責務を整理し、IK 計算を独立した solver に分離したうえで、肩・肘・手首 target から quaternion ベースの上腕・前腕回転を求める。

## 背景

- `@pixiv/three-vrm` は `getNormalizedBoneNode()` と normalized pose API を提供しており、VRM 個体差を吸収する入口として現在の実装と相性がよい。
- Three.js の `CCDIKSolver` は公式 addon だが `SkinnedMesh.skeleton.bones` index ベースであり、現行の normalized bone 直操作とはブリッジ検証が必要。
- まずは自前 solver で腕 chain の責務を明確化し、必要であれば後続で外部 solver と比較する。

## スコープ

- `SincroPoseRetargeter` から IK solver を独立モジュールへ分離する
- `leftUpperArm` / `leftLowerArm` / `leftHand` と右腕の normalized bone world transform を測定する
- 肩 target、手首 target、肘 pole target から two-bone IK を解く
- VRM の腕長、肩幅、初期姿勢、左右 mirror を考慮して target をモデル空間へ変換する
- 結果は Euler の加算値ではなく quaternion または normalized pose として扱う
- twist clamp、肘曲げ方向、到達不能 target の clamp、return-to-neutral、smoothing を実装する
- 簡易 IK と 3D IK を設定または Debug Console で切り替え可能にする

## 非対象

- 全身 IK
- 手指トラッキング
- 外部 IK ライブラリの本採用
- `CCDIKSolver` / FABRIK solver の比較実装
- サーバー側 endpoint / JSON 契約変更

## 実装方針

1. `SincroPoseRetargeter` は target gate、mode selection、smoothing、fallback frame 生成を担当し、IK の数学は新しい solver へ閉じ込める。
2. solver は VRM 依存を最小化し、入力に rig metrics と target、出力に bone rotation result を返す。
3. normalized bone は `VRMCharacterManager` ロード後に測定し、VRM 差し替え時に solver state を reset する。
4. 腕 chain は肩を root、手を effector、肘を pole として扱う。
5. 到達不能 target は腕長内へ clamp し、急な反転や肘の裏返りを `maxDelta` と pole smoothing で抑える。
6. IK active 時は `ArmBoneController` の idle / speech gesture と競合しないよう、腕ごとに priority を維持する。
7. コメントは座標変換、quaternion の基準姿勢、pole / twist clamp の理由を説明する。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroArmIkSolver.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/RotationFilter.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/panels/SincroMotionPanel.tsx`
- `documents/design/frontend/character/motion.md`

## 完了条件

- `sincro` で片手を上下左右へ動かした時、VRM の手先が target 方向だけでなく到達位置として追従する。
- 肘 target / pole が効き、肘曲げ方向が画面上の肘位置と大きく矛盾しない。
- 到達不能 target、低 confidence、片腕欠損、手首画面外で腕が跳ねず、部位単位で fallback する。
- IK mode を `feature_only` / `screen_space_ik` / `world_3d_ik` のように切り分けて観測できる。
- 複数 VRM で normalized bone 欠損時に例外停止せず、安全に簡易 retarget または neutral へ戻る。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

```sh
playwright-cli open http://127.0.0.1:5173/simple-vrm/
```

## 手動確認観点

- 片手上げ、横開き、肘曲げ、手首を前後に動かす構図で、手先到達感を見る。
- 腕を伸ばしきった時に肘が反転しない。
- 両腕を左右非対称に動かしても、肩・胸・腕が同時に最大化して破綻しない。
- IK 強度を 0 にした時、既存 feature retarget へ滑らかに戻る。

## 設計同期メモ

- `documents/design/frontend/character/motion.md` に 3D IK solver の責務境界、座標系、fallback、motion priority を追記する。
- `documents/design/frontend/character/tracking.md` に world target の品質情報と solver gate の関係を追記する。
