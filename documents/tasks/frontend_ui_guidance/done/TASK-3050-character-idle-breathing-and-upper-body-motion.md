# TASK-3050 呼吸・重心移動・上半身 idle motion

- 作成日: 2026-05-08
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3048`
- 依存: `TASK-3049`

## 目的

待機中のキャラクターが静止した人形に見えないよう、呼吸、重心移動、肩、胸、背骨、腕、手首の小さな動きを追加する。過剰な演出ではなく、常時見えても邪魔にならない生命感を作る。

## 背景

- 現状の `ArmBoneController` は固定ポーズとごく小さい sine 揺れに留まっている。
- 首や口が止まっている時に全身がほぼ静止するため、対話待機中の空気が薄い。
- 今後の VAD 連動や AI 発話 gesture の土台として、基準姿勢と補間できる idle motion が必要。

## スコープ

- 呼吸に合わせた胸、背骨、肩の微小回転/位置変化
- hips または spine の小さな重心移動
- 腕、肘、手首の低振幅 idle motion
- `VRMCharacterManager.update()` に統合された毎フレーム更新
- 任意ボーン欠損時の graceful degradation
- idle motion の設定値整理

## 非対象

- VAD 連動の聞き姿勢
- 目線/まばたき
- AI 発話中の gesture
- UI からのモーションチューニング画面

## 実装方針

1. 固定ポーズを毎フレーム直接上書きする controller を見直し、基準姿勢 + 状態別 offset の形へ寄せる。
2. 呼吸は 3 秒から 5 秒程度の周期で、胸/肩/背骨へ低振幅に分散する。
3. 重心移動は呼吸よりさらに遅く、左右/前後の移動量を画面内で目立ちすぎない範囲に抑える。
4. 腕や手首は周期を完全同期させず、少し位相差を持たせる。
5. `Math.sin(performance.now())` の散在を避け、モーション時間と設定を一箇所へ寄せる。
6. 存在しないボーンはログ過多にせず、その部位だけ無効化する。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/LegBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionConfig.ts`

## 完了条件

- `idle` 状態で、呼吸、上半身、腕、手首の小さな動きが見える。
- 動きが大きすぎず、チャットや設定 UI を見ている時に気になりすぎない。
- `ArmBoneController` の固定上書きと新しい idle motion が競合しない。
- 任意ボーンが欠損しても VRM 読み込みや描画が止まらない。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- backend 未起動、カメラ OFF、マイク OFF の状態で idle motion が継続する。
- desktop/mobile でキャラクターが画面外へずれない。
- 30 秒以上待機しても周期が機械的すぎず、不自然な大振りにならない。
- 複数 VRM で腕や肩が破綻しない。
