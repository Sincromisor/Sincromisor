# TASK-3106 Optional SincroPoseTracker と性能ゲート

- 作成日: 2026-05-11
- ステータス: Open
- 優先度: Medium
- 親タスク: `TASK-3100`
- 依存: `TASK-3105`

## 目的

`TASK-3105` で Pose Landmarker が採用可能と判断された場合に、肩・腕・上半身同期の optional pipeline として `SincroPoseTracker` を実装する。性能不足時は自動または手動で face-only に降格できるようにする。

## 背景

- Pose Landmarker は将来の手・腕・上半身同期の鍵になるが、常時有効化すると性能リスクが高い。
- sincro の最小体験は顔同期で成立するため、pose は必須ではなく拡張機能として扱う。
- ユーザー環境差が大きいため、設定と自動降格の両方が必要になる。

## スコープ

- `SincroPoseTracker` または同等の optional tracker を追加する
- Pose 推論 fps を制限する
- 推論時間や連続失敗を監視し、face-only fallback できるようにする
- `poseMotion` snapshot を `CharacterBehaviorState` に追加する
- 肩・上腕・前腕・胸相当の retarget の入口を作る
- 実際の腕同期は低振幅・限定範囲から始める

## 非対象

- 高精度な全身 IK
- 手指トラッキング
- ダンスや大きな全身移動
- Pose Landmarker が不採用になった場合の無理な実装

## 実装方針

1. `SincroPoseTracker` は `SincroFaceTracker` とは別 loop / 別状態として扱う。
2. 推論は 10-15fps を初期値とし、VRM 適用は render loop で補間する。
3. world landmarks が使える場合は肩幅や奥行き推定へ使い、使えない場合は normalized landmarks で fallback する。
4. low confidence や landmark 欠損時は前回値 hold 後にニュートラルへ戻す。
5. 推論時間が閾値を超え続けたら Debug に表示し、pose を停止または face-only に降格する。

## 実装対象候補

- `sincromisor-frontend/src/ts/CharacterGaze/SincroPoseTracker.ts` または `src/ts/FaceTracking/**`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts` または同等の新規ファイル
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`

## 完了条件

- Pose Landmarker 採用判断が `TASK-3105` に記録されている。
- 採用時は `sincro` で上半身または腕の低振幅同期が有効化できる。
- 性能不足時に face-only へ戻せる。
- Pose OFF でも顔同期は継続する。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- Pose ON / OFF の切替で tracker loop が残らない。
- 肩や腕を動かした時、キャラクターが過大にねじれない。
- カメラに腕が映らない時に腕が暴れない。
- 推論負荷が高い場合、Debug 表示と fallback が機能する。

