# character animation 3.0 media pipe raw replay player

## 背景 / 目的

Phase 1 の replay は、最初から video を再推論するのではなく、記録済みの MediaPipe raw result / normalized snapshot を同じ後段 pipeline に再投入する mode から始める。これにより camera 権限や detector の揺れに依存せず、retarget / solver / metrics の変更差分を比較できる。

このタスクでは、`motion-debug` で export した log v1 を読み込み、ライブ camera なしで frame sequence を再生し、既存 retarget 経路へ同じ入力順で流せる `MotionReplayPlayer` を追加する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts` を追加し、`MotionReplayPlayer`、`MotionReplayMode`、`MotionReplayFrameResult` を export する。
- [ ] `MotionReplayMode` は `"pose-snapshot" | "final-pose-playback" | "mediapipe-raw-result"` に固定する。`"mediapipe-raw-result"` は Phase 1 では呼び出し可能だが常に `unsupported_mode` result を返す。
- [ ] `"pose-snapshot"` mode は log frame の `frame.poseSnapshot` を `SincroPoseMotionSnapshot` として読み、`CharacterBehaviorState.applyPoseMotion()` 相当の入口へ流し、`SincroPoseRetargeter.retarget()` が live camera と同じ順序で呼ばれる状態を作る。`frame.poseSnapshot` 欠落時は `missing_pose_snapshot` を返す。
- [ ] `"final-pose-playback"` mode は solver 後の saved frame を再描画 / preview するための mode とし、retarget / solver の再実行はしない。v1 では `finalPose` slot 欠落時に deterministic な `missing_final_pose` result を返す。
- [ ] `MotionReplayFrameResult` と window API の最小 schema は本タスクの「設計判断」にある discriminated union / signature に固定する。parse error、out-of-range、unsupported、missing slot の code を実装者判断にしない。
- [ ] `MotionDebugApp` の window API に `loadRecording(fileOrText)`、`startReplay(options)`、`stepReplay(frameIndex)`、`stopReplay()`、`getReplayState()` を追加する。replay 中は live camera runtime を停止し、camera track を要求しない。`loadRecording()` が受ける入力は plain NDJSON `string` または `File` に限定し、compressed Blob import は本タスクでは扱わない。
- [ ] replay は `timestamp.mediaTimeMs` を正本時刻として使い、`performance.now()` を replay frame の順序決定に使わない。手動 step では指定 `frameIndex` の結果だけを返す。
- [ ] 同一 log を 2 回 replay したとき、同一 `poseRetarget` snapshot JSON が得られることをユニットテストまたは Playwright 経由で検証する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` へ replay mode の責務、`frame.poseSnapshot` replay、raw mode は予約のみであること、window API の公開範囲を同期する。

## 設計判断（着手前に確定済み）

- 初期 replay の主対象は `frame.poseSnapshot` に保存された `SincroPoseMotionSnapshot` とする。現行 `SincroPoseTracker.detect()` は `PoseLandmarker.detectForVideo()` の result をすぐ normalized snapshot へ変換しており（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts:66`）、MediaPipe raw result serializer はまだ存在しないため、Phase 1 の最小 replay は normalized pose snapshot で実現する。
- `mediapipe-raw-result` mode は API と schema slot だけ予約する。不完全な raw serializer を作って v1 log を固定するより、後続で Pose / Hand / Face raw serializer が揃った時点で実行可能にする。
- replay player core は DOM を持たず `src/character/motionEvaluation/` に置く。`motion-debug` での file input / button / state 表示は page 側に閉じる。
- replay 中は `TrackerRuntime.startFaceTracking()` を呼ばない。camera / Worker / MediaPipe detector の状態を排除して、後段 pipeline の決定性を見るため。
- `final-pose-playback` は visual QA 用であり、metrics 用の solver 再実行とは分ける。タスクを大きくしないため、VRM normalized pose の完全 composer は Phase 6 以降へ残す。

replay result / API の最小 shape:

```ts
type MotionReplayMode = "pose-snapshot" | "final-pose-playback" | "mediapipe-raw-result";

type MotionReplayFrameResult =
    | { ok: true; mode: MotionReplayMode; frameIndex: number; mediaTimeMs: number; snapshot: MotionDebugSnapshot }
    | { ok: false; mode: MotionReplayMode; frameIndex?: number; code: "unsupported_mode" | "missing_pose_snapshot" | "missing_final_pose" | "parse_error" | "frame_index_out_of_range" | "no_recording_loaded"; message: string };

type MotionReplayState = {
    status: "idle" | "loaded" | "playing" | "paused" | "stopped" | "error";
    mode?: MotionReplayMode;
    frameCount: number;
    currentFrameIndex?: number;
    lastResult?: MotionReplayFrameResult;
};

loadRecording(fileOrText: File | string): Promise<{ ok: true; state: MotionReplayState } | { ok: false; code: "parse_error" | "unsupported_input"; message: string }>;
startReplay(options: { mode: MotionReplayMode; autoplay?: boolean }): MotionReplayFrameResult;
stepReplay(frameIndex: number): MotionReplayFrameResult;
stopReplay(): MotionReplayState;
getReplayState(): MotionReplayState;
```

## スコープ境界

- 本タスクでやること:
    - log import / parse と replay state。
    - pose snapshot replay。
    - final pose playback mode の skeleton と欠落時 result。
    - `motion-debug` window API からの replay 操作。
- 本タスクでやらないこと:
    - video fixture から MediaPipe を再推論する mode。
    - Hand / Face / Gesture raw result serializer。
    - metrics 計算と pass / warn / fail 比較。
    - canonical state replay の本実装。Phase 2 で canonical contract が固まった後に追加する。

## 実装方針（既存コード整合: file:line）

- `MotionDebugApp.loadVideoFixture()` は既に fixture video から stream を作って本番 tracker を起動できる（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:202`）。本タスクの replay はこの video fixture mode ではなく、import 済み log を camera なしで後段へ流す別 mode として追加する。
- `stopActiveRuntime()` は tracker 停止、stream track stop、fixture pause、tracking disable をまとめて行う（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:255`）。replay 開始前に必ずこの経路を呼び、live runtime と replay が同時に動かないようにする。
- pose motion の live 適用は `handlePoseMotion()` が `latestPoseSnapshot` 更新、`behaviorState.applyPoseMotion()`、Debug Console 更新、overlay 描画を行う（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:274`）。pose snapshot replay も同じ副作用へ合流させる。
- `VRMCharacterManager.update()` は `CharacterBehaviorState.update()` の snapshot から `SincroPoseRetargeter.retarget()` を呼び、Debug Console に retarget frame を出す（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:185`、`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:205`）。replay 後の決定性検証はこの `poseRetarget` snapshot を比較対象にする。
- `MotionDebugSnapshot` は `poseRetarget` と `poseRetargetRuntime` を含む（`sincromisor-frontend/src/pages/motionDebug/types.ts:23`）。window API の replay result はこの snapshot から比較可能な subset を返す。

## テスト

- `cd sincromisor-frontend && npm run test -- motionReplayPlayer`
- `cd sincromisor-frontend && npm run build`
- `motion-debug` の window API で同一 log text を 2 回 `startReplay()` し、同じ frame range の `poseRetarget` JSON が一致することを確認する。Playwright が使えない場合はユニットテストに replay harness を作る。
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer 向け replay mode を追加するため、`documents/design/frontend/character/motion.md` に replay mode の責務分離、`documents/design/frontend/character/tracking.md` に live tracker を起動しない raw/snapshot replay の境界を同期する。
