# TASK-3115 Sincro Pose の上半身アンカーと IK フォールバック安定化

- 作成日: 2026-05-14
- ステータス: Done
- 優先度: Medium
- 親タスク: `TASK-3100`
- 依存: `TASK-3114`

## 目的

簡易腕 IK が肩・胸・背骨の動きと競合しないよう、上半身アンカー、肩補正、欠損時 fallback を整える。

腕だけを手首 target へ寄せると、肩幅や胴体傾きが映像とずれた時に腕が体へ刺さる、肩が過剰に回る、片腕欠損時に左右差が不自然になる。本タスクでは IK を本格化するのではなく、既存の上半身 retarget と簡易 IK の優先順位を整理する。

## 背景

- `SincroPoseRetargeter` は spine / chest / shoulder / arm を同じ frame として返している。
- `ArmBoneController` は idle / AI speech gesture / pose retarget を加算しており、`sincro` では motion priority による抑制が必要。
- カメラ構図では腰が映らないことが多く、肩・胸のアンカーが不安定になると腕 IK も破綻しやすい。

## スコープ

- 肩中心・肩幅・腰中心の信頼度に応じて upper body retarget の反映量を変える
- 腕 IK 有効時は肩・胸・腕の加算順序を明確化する
- 肩 target と VRM 肩ボーンの差分を小さく吸収する shoulder anchor offset を追加する
- 片腕だけ IK、両腕 IK、両腕 fallback の mode を frame 上で区別できるようにする
- `motionPolicy.allowPoseRetarget` と `pose.active` / `arm.active` の関係を整理し、AI speech gesture や idle arm motion と競合しないようにする
- Debug Console で IK active / fallback / anchor reason を確認できるようにする

## 非対象

- IK solver 自体の刷新
- 腰・脚を含む全身 pose retarget
- 手指トラッキング
- 新規外部ライブラリの導入

## 実装方針

1. `sincro` では pose IK を最優先にし、AI speech gesture は原則抑制する。
2. idle motion は完全停止ではなく、IK target を邪魔しない低強度の呼吸・微小揺れだけ残す。
3. 肩・胸補正は腕 IK の見た目を助ける範囲に限定し、体幹が大きく曲がる表現は避ける。
4. fallback は全体停止ではなく、部位単位で neutral / low-amplitude retarget へ戻す。
5. コメントは、motion priority と fallback の理由を中心に書く。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/**`

## 完了条件

- 腕 IK 有効時に、肩・胸・腕の動きが同時に最大化して破綻しない。
- 片腕だけ見えている時、見えている腕だけが追従し、見えていない腕は自然に戻る。
- 腰が映っていない上半身構図でも、肩幅と肩中心を使って安定した追従ができる。
- `sincro` で AI speech gesture が腕 IK を上書きしない。
- fallback reason が Debug Console で分かる。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

## 手動確認観点

- 腰が映らない距離、上半身全体が映る距離、片腕だけ映る距離を切り替える。
- 肩を傾けた状態で片手を上げても、肩・腕が過剰にねじれない。
- `sincro` 中に AI 応答が来ても、腕 IK の追従感が大きく崩れない。

## 後続検討

- 肩 anchor だけでは腕の到達感が不足する場合、upperChest / chest の配分を VRM ごとに調整する設定を検討する。

## 実施結果

- `SincroPoseRetargetFrame` に `ikMode`、frame fallback reason、上半身 anchor reason / weight / shoulder offset、腕ごとの `ikActive` / fallback reason を追加した。
- 肩 target confidence、肩幅、腰中心の有無に応じて upper body retarget 量を落とし、腰が映らない構図では `hips_fallback_to_shoulders` として肩幅 anchor を使うようにした。
- 腕 IK target が欠ける場合は腕単位で feature-only / neutral fallback へ戻し、片腕 IK と両腕 IK を frame 上で区別できるようにした。
- pose IK が active の腕では AI speech gesture を入れず、idle arm motion を低振幅化して IK target と競合しにくくした。
- Debug Console の Sincro Motion / Pose に IK mode、retarget fallback、anchor reason / weight / offset を表示するようにした。

## 確認結果

```sh
cd sincromisor-frontend
npm run build
```

- 成功（Vite の既存 chunk size warning のみ）

## 設計ドキュメント更新メモ

- `documents/design/frontend_character.md` は `TASK-3116` の観測性・実機検証と合わせて、簡易 IK frame diagnostics と upper body anchor fallback の仕様を追記する。
