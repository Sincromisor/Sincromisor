# TASK-3111 Sincro Pose Retarget の正式化とチューニング

- 作成日: 2026-05-12
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3106`, `TASK-3107`

## 目的

`sincro` モードで PoseLandmarker 由来の上半身・腕の動きを、キャラクターの動作として実用可能な形で反映する。

現状は `SincroPoseTracker`、`SincroPoseRetargeter`、`CharacterBehaviorState.poseMotion`、`ArmBoneController` / `CharacterMotionOrchestrator` への適用経路が存在するが、ユーザー向け機能としての ON/OFF、適用条件、反映強度、実カメラ確認、設計同期が不足している。既存の optional pose pipeline を正式な第一段として磨き、低性能端末や不安定な姿勢検出では face-only に戻れる状態にする。

## 背景

- `TASK-3106` で PoseLandmarker は optional pipeline として組み込まれた。
- `SincroCharacterGazeController` は `sincro` モードで `SINCRO_POSE_TRACKING_ENABLED = true` を使い、Pose 推論を開始している。
- `TrackerRuntime` は Pose 推論の低 fps 化、推論遅延・連続失敗時の face-only fallback を持つ。
- `SincroPoseRetargeter` は `poseMotion` を spine / chest / shoulder / arm 向けの低振幅 retarget frame へ変換している。
- `VRMCharacterManager.update()` は retarget 済み pose を腕・上半身 controller に渡している。
- ただし、固定有効化のままでは環境差が大きく、動いているか・効きすぎていないか・いつ無効化されたかをユーザーと開発者が判断しづらい。

## スコープ

- `sincro` pose tracking の有効/無効を設定または Debug Console から切り替えられるようにする
- 固定値 `SINCRO_POSE_TRACKING_ENABLED` を実行時設定へ置き換える
- `CharacterBehaviorSnapshot.motionPolicy.allowPoseRetarget` を VRM 適用側の明示的な gate として使う
- `SincroPoseRetargeter` の反映強度、confidence gate、smoothing、neutral return を調整可能にする
- 肩・胴体・上腕・前腕・手首の反映量を実カメラで調整する
- Pose fallback 時に face-only が継続し、腕・上半身が自然に neutral へ戻ることを確認する
- Debug Console で pose detected / confidence / inference / fallback / retarget 有効状態を切り分けられるようにする
- `documents/design/frontend_character.md` を正式化後の仕様に同期する

## 非対象

- 全身 IK の本格実装
- 手指トラッキング
- Holistic Landmarker への置き換え
- `worldLandmarks` を使った高精度 3D retarget の本実装
- サーバー側 endpoint / JSON 契約の変更
- WebRTC signaling の変更

## 実装方針

1. Pose は `sincro` の補助入力として扱い、顔同期を止めない optional pipeline のまま維持する。
2. 初期目標は「肩・胴体・腕の雰囲気同期」とし、正確な腕 IK は狙わない。
3. 反映は低振幅 additive retarget とし、既存の idle / face retarget を破壊しない。
4. `allowPoseRetarget` が false、`poseMotion.degradedToFaceOnly` が true、または confidence 不足の場合は neutral へ戻す。
5. ユーザー設定では簡単な ON/OFF と強度に絞り、細かい数値は Debug Console 側に寄せる。
6. 推論 fps と fallback 条件は `TrackerRuntime` に集約し、VRM controller 側へ MediaPipe の都合を漏らさない。
7. コメントは、なぜ低振幅・強い smoothing・fallback を選ぶかという制約を説明する。

## 実装対象候補

- `sincromisor-frontend/src/ts/App/SincroCharacterGazeController.ts`
- `sincromisor-frontend/src/ts/FaceTracking/TrackerRuntime.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/**`
- `sincromisor-frontend/src/react/settings-fields/SettingsFields.tsx`
- `sincromisor-frontend/src/ts/UI/DialogManager.ts`
- `sincromisor-frontend/src/ts/UI/DialogStateStore.ts`
- `documents/design/frontend_character.md`

## 完了条件

- `sincro` pose tracking を実行時に ON/OFF できる。
- Pose OFF または fallback 時に face-only 同期が継続し、腕・上半身が neutral へ自然に戻る。
- `motionPolicy.allowPoseRetarget` が VRM 適用側で明示的に尊重されている。
- Pose retarget の強度または主要パラメータを調整できる。
- 実カメラで肩・胴体・腕の反映が見える一方、過大回転や細かな震えが目立たない。
- Debug Console で Pose 推論状態、fallback、retarget 適用状態を確認できる。
- `chat` モードの注視、AutoMute、AI speech gesture が壊れていない。
- `sincro` face-only の head / blink / mouth 同期が Pose の有無に巻き込まれない。
- `cd sincromisor-frontend && npm run build` が成功する。
- desktop / mobile viewport で Settings / Debug Console の表示崩れがない。
- `documents/design/frontend_character.md` が実装後の Pose 反映仕様に更新されている。

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
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

## 手動確認観点

- `sincro` で顔同期だけの状態と、Pose ON の状態を切り替えて差分が分かる。
- 肩を傾ける、上腕を上げる、肘を曲げる、手首を上下させる動きが低振幅で反映される。
- 腕が画面外に出たとき、該当部位だけが急に跳ねず neutral へ戻る。
- Pose 推論が遅い環境で face-only fallback しても、FaceLandmarker 側の同期が継続する。
- 実カメラ距離が近い、上半身だけ映る、片腕だけ映るケースで破綻しない。
- Debug Console を開いた状態で推論・描画が極端に重くならない。

## 後続検討

- 実カメラ検証で簡易 2D retarget の限界が明確になった場合は、`worldLandmarks` 利用または Kalidokit などの既存 retarget ライブラリ採用を別タスクで比較する。
- PoseLandmarker は実カメラで認識・低振幅 retarget が成立した一方、FaceLandmarker との同時実行や model 初期化時の main thread ブロックが目立つため、Worker 化を `TASK-3112` として切り出す。
