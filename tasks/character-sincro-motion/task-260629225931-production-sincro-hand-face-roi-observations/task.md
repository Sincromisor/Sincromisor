# Enable production sincro hand and face ROI observations

## 背景 / 目的

Phase 8 の Hand / Face ROI と低次元 Hand snapshot は実装済みだが、本番 `sincro` 起動では `onHandMotion` callback も `poseOptions.hand` / `faceRoi` option も渡っていない。結果として MotionIntent / finger / reliability の材料が本番に届かない。

本タスクでは Hand / Face ROI を本番 `sincro` で観測可能にする。ただし finger pose / semantic gesture の VRM 適用はしない。

## 完了条件（受け入れ条件）

- [ ] `startSincroFaceTracking()` から `TrackerRuntime.startFaceTracking()` へ `onHandMotion` callback を渡し、latest hand snapshot を observe-only pipeline state と Debug Console summary に保存する。
- [ ] `poseOptions.hand.enabled` と `poseOptions.faceRoi.enabled` を本番 `sincro` で明示的に渡す。初期値は `true` にするが、`enableSincroPoseTracking()` が false の場合は Hand / Face ROI も起動しない。
- [ ] Hand snapshot は腕 IK target を上書きしない。腕 target は引き続き `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` を正本にする。
- [ ] Hand / Face ROI の失敗は `faceMotion` / `poseMotion` の既存適用を止めない。Hand tracker 初期化失敗時は lost hand snapshot と warning に落とす。
- [ ] `onHandMotion` は `talkMode === "sincro"` かつ CharacterGaze enabled のときだけ state へ反映する。mode 切替後に古い hand snapshot を残さない。
- [ ] Debug Console は hand availability、source、ROI warning、openness、confidence を低頻度 summary として表示できる。raw landmarks は表示 / 保存しない。
- [ ] production TypeScript comment audit を実施し、MediaPipe / ROI / lifecycle / fallback の public export または境界 decision に必要な保守コメントを追加・更新する。
- [ ] `impl.md` に comment audit table を記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、対象は `startSincroFaceTracking()` の hand / faceRoi option decision、`onHandMotion` handling、mode 切替時の stale hand reset、Hand ROI failure fallback、Face ROI failure fallback、腕 IK target を Hand wrist で上書きしない判断を必ず含める。
- [ ] audit の `decision` は `keep` / `rewrite` / `delete` / `add` に限定する。弱い既存コメント、実装と矛盾した stale comment、名前・型から分かるだけのコメントは `rewrite` または `delete` にする。コメントを省略する場合は省略理由を audit に書く。TODO を追加する場合は理由、削除条件、canonical task ID、判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- Hand / Face ROI は observe-only 入力として接続し、VRM finger / semantic pose へは接続しない。意味表現と適用は後続 task の責務。
- 起動 option は `SincroCharacterGazeController.startSincroFaceTracking()` で明示する。Dialog UI の新設定は本タスクでは追加しない。既存 performance degradation が ROI を落とせるため、初期 UI を増やさず観測を先に確認する。
- Hand snapshot の保存先は `SincroMotionPipelineState.hand` とする。`CharacterBehaviorSnapshot` へは追加しない。

## スコープ境界

- 本タスクでやること: 本番 Hand / Face ROI 起動、hand callback、observe-only state / Debug Console summary、reset。
- 本タスクでやらないこと: Gesture Recognizer 実行、finger bone 適用、MotionIntent による semantic pose 適用、設定 UI 追加。
- 依存タスクとの境界: observe-only task は canonical / temporal / intent の更新先を用意する。本タスクは Hand / ROI 入力を追加する。

## 実装方針（既存コード整合: file:line）

- 現在 `startFaceTracking()` 呼び出しには `onHandMotion` が無く、pose option も `enabled` / `targetInferenceFps` / `ignorePerformanceFallback` だけである（`sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts:256`、`sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts:276`）。
- `TrackerRuntimeTypes` は `onHandMotion` と `poseOptions.hand` を既に持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:40`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:54`）。
- `SincroHandTracker` は Pose wrist 由来 ROI と full-frame fallback を扱う（`sincromisor-frontend/src/features/gaze/handTracking/sincroHandTracker.ts:176`）。
- 設計文書は Hand wrist を腕 IK target の主値にしないと明記している（`documents/design/frontend/character/motion.md:70`）。

## テスト

- `cd sincromisor-frontend && npm run test -- trackerRuntime`
- `cd sincromisor-frontend && npm run test -- sincroHandMotionSnapshot`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。本番 `sincro` の tracker 起動構成と Debug Console 観測面が変わるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に Hand / Face ROI が observe-only 入力として有効になること、腕 IK target を上書きしないことを同期する。
