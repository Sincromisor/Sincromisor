# Evaluation: task-260705214018-mediapipe-raw-result-replay

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `motionReplayRawResultSchema.ts` の追加と `SincroMotionReplayRawResultFrame` / parser export — raw replay frame schema と `parseMotionReplayRawResultFrame()` が追加され、`pose` / `hand` / `face` / `gesture` / `timing` を検証している。non-JSON runtime object は slot detail 付きで reject する。
- [✓] `frame.mediapipe` 欠損時に `missing_mediapipe_raw_result` を返し、`pose-snapshot` fallback しない — `MotionReplayPlayer.applyRawResultFrame()` と `motionReplayPlayer.test.ts` の missing raw test で確認。
- [✓] raw schema parse 失敗時に `parse_error` と失敗 slot detail を返す — parser の `errors[].slot` と player の error message、`motionReplayRawResultSchema.test.ts` / `motionReplayPlayer.test.ts` で確認。
- [✓] `MotionReplayPlayer.startReplay({ mode: "mediapipe-raw-result" })` は `applyRawResult` callback 指定時に raw frame を渡し、未指定時だけ `unsupported_mode` — `MotionReplayPlayerOptions.applyRawResult`、`applyRawResultFrame()`、テストで確認。
- [✓] raw replay context の `frameIndex`、`mediaTimeMs`、`frame` の意味を維持 — raw mode でも pose-snapshot と同じ `MotionReplayApplyContext` を渡している。
- [✓] raw replay は既存 normalizer 境界を通す — `motionDebugReplayRuntime.ts` で Pose / Hand / Face / Gesture の既存 normalizer / assignment helper を呼んでいる。Gesture は現行 snapshot に保持先がないため、impl.md の記録どおり parse/normalize 境界の確認に留めている。
- [✓] recording は serializer が raw slot を返す場合のみ `frame.mediapipe` を保存し、空 object を記録済みにしない — `createTrackerRuntimeMediaPipeRawResult()` は全 slot `undefined` で `undefined` を返し、recording は optional spread で保存している。`motionDebugRecorder.test.ts` で optional raw slot export を確認。
- [✓] manifest `build.packageVersions` と `build.configHash` は固定値 / 空 object ではない — Vite define 由来の frontend version、`@mediapipe/tasks-vision` version、performance profile + retarget config の `fnv1a32:` hash を保存している。
- [✓] schema version v1 維持と旧 replay 挙動維持 — `SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION` は `sincro.motion-debug-log.v1` のまま、`frame.mediapipe` は optional `unknown` slot。既存 `pose-snapshot` / `final-pose-playback` の error path は維持されている。
- [✓] TypeScript production comment audit は `impl.md` に指定列で記録 — attempt 1 / 2 / 3 の audit table は指定列を持ち、raw schema parser、`applyRawResult` callback、missing raw fallback 非採用、manifest build metadata、MediaPipe raw serializer 境界を含む。
- [✓] comment audit 記録だけでなく、実コード上の public export / boundary コメントが十分であること — 前回 FAIL 対象の `mediaPipeRawResultSerializer.ts` exported type/functions は attempt 3 で TSDoc が実コードに合わせて修正済み。empty landmark/category arrays でも serializer が raw slot object を返し、`undefined` は model 未ロード / inference 未実行 / inference failure / gesture prerequisite 不成立など tracker 側で slot が作られない状態である、という実装と矛盾しない説明になっている。

## テスト結果

- `npm run gate`（cwd: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-9d239ac3c920-tzKqcK`）: PASS。対象 SHA `9d239ac` の clean tree で cache hit。
  - `gate:lint`: PASS。frontend lint/format and Markdown check。
  - `gate:build`: PASS。frontend type check and build。
  - `gate:test`: PASS。491 tests passed。
- `git diff --check 09d8380..HEAD`: PASS。
- カバレッジ評価: raw schema/parser、raw replay player error code、callback/context semantics、recording raw slot、manifest metadata は unit test と実コード照合で主要受け入れ条件をカバーしている。comment acceptance は gate では検出できないため、attempt 3 audit と serializer TSDoc / tracker 呼び出し実装を個別照合した。

## ドキュメント整合性

- 公開 WebRTC / backend 契約の変更はなし。
- developer-visible な motion-debug log / replay mode 契約は変更あり。`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` は raw replay mode、raw slot 欠損 error、parse error、manifest build metadata、video re-inference 非対象に同期済み。
- ドキュメント未同期は確認していない。

## 残課題（FAIL の場合）

- なし。
