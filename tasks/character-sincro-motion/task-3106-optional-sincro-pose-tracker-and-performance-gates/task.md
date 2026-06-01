# TASK-3106 Optional SincroPoseTracker と性能ゲート

- 作成日: 2026-05-11
- ステータス: Done
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

## 実施メモ 2026-05-11

### 実装

- `SincroPoseMotionSnapshot` を追加し、`CharacterBehaviorSnapshot.poseMotion` として faceMotion から分離して保持するようにした。
- `SincroPoseTracker` を追加した。
    - MediaPipe `PoseLandmarker` Lite model を `/3rd_party/pose_landmarker_lite.task` から読み込む。
    - 肩、肘、手首、腰 landmark から肩傾き、胴体傾き、上腕リフト、上腕開き、前腕屈曲、手首上げを正規化する。
    - landmark visibility が低い部位は部位単位で無効化し、腕が画面外に出た時の暴れを抑える。
- `TrackerRuntime` を face + optional pose の共有実行基盤に拡張した。
    - FaceLandmarker は既定 15fps、PoseLandmarker は既定 12fps。
    - Pose 推論が 38ms 以上で4回続く場合、または姿勢検出失敗が18回続く場合は pose だけを停止し、face-only に降格する。
    - face runtime error 時は pose も停止するが、pose fallback 時は face tracking を継続する。
- `SincroPoseRetargeter` を追加した。
    - optional poseMotion から spine/chest/shoulder/arm 向けの低振幅 retarget frame を生成する。
    - 強めの smoothing と neutral return を持ち、`degradedToFaceOnly` または低 confidence 時は自然に neutral へ戻す。
- `ArmBoneController` と `CharacterMotionOrchestrator` に pose retarget frame の入口を追加した。
    - 上半身同期は肩・胸・spine に小さく加算する。
    - 腕同期は既存の idle / speech gesture に低振幅 offset として加算する。
- `SincroCharacterGazeController` で `sincro` mode 時に optional pose tracking を起動し、fallback 状態を Debug Console の gaze target debug へ表示するようにした。
- `documents/design/frontend_character.md` に実装後の pose fps / performance gate / face-only fallback を反映した。

### 確認

- `cd sincromisor-frontend && npm run build`: 成功。

### 残り確認

- 実カメラでの Pose 推論時間、腕が画面外に出た時の挙動、肩・腕の見た目の過大回転は未確認。
- 実測値によっては gate 閾値、pose target fps、retarget 振幅を調整する。
