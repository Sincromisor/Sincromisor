# Implementation Log: task-260705214018-mediapipe-raw-result-replay

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 実装判断

- `mediapipe-raw-result` replay は pose snapshot へ暗黙 fallback せず、raw slot が無い frame は `missing_mediapipe_raw_result` で停止する方針にした。raw replay の評価対象を曖昧にしないため。
- raw result は MediaPipe の runtime instance そのものではなく、landmark / category / matrix など replay に必要な JSON-safe subset として録画する。`MPMask` / `ImageBitmap` / `VideoFrame` / crop canvas / task instance は録画対象外。
- hand raw は full-frame fallback 検出結果だけを保存対象にした。ROI crop 側の raw result は crop-local 座標と crop context を持つため、そのまま raw replay に入れると評価境界が変わる。
- replay runtime は raw Pose / Face / Hand / Gesture を既存 normalizer に通す。Gesture は現行 `MotionDebugSnapshot` に保持先がないため、parse/normalize 境界の確認に留め、pose snapshot には反映しない。
- manifest は app version / MediaPipe package version / frontend package version / deterministic config hash を持つ。config hash は performance profile と retarget config pipeline から stable JSON を作り `fnv1a32:` として記録する。
- review.md の申し送りどおり、`applyRawResult` が無い場合だけ `unsupported_mode` とし、raw slot の optional 性は v1 backward compatibility として扱った。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期した。
- raw replay の supported behavior、raw slot 欠落時の停止、parse error の slot/path 情報、manifest build metadata、video re-inference 非対象を記録した。

### ハマった点 / 回避

- `npm run gate` の Markdown check は worktree 内の copied `tasks/**/review.md` も対象にするため、既存の review.md 5 件が Prettier 未適用で失敗した。semantic change は入れず、空行整形だけを同一コミットに含めた。

### 残リスク

- Hand replay は full-frame fallback の side assignment 境界で検証する。ROI crop-local raw replay は、crop context を録画/復元する別設計が必要なため今回の対象外。
- MediaPipe raw result から video frame を再推論する経路は今回も対象外。録画済み raw JSON subset の deterministic replay を対象にした。
- Gesture raw は schema/parser と normalizer 境界を通すが、現行 snapshot に gesture 状態の保存先がないため visual replay には直接反映しない。

### Verification

- `cd sincromisor-frontend && npm run test -- motionReplayPlayer motionReplayRawResultSchema motionDebugRecorder` PASS
- `cd sincromisor-frontend && npm run build` PASS
- `cd sincromisor-frontend && npm run check` PASS
- `npm run tasks:check` PASS
- `git diff --check` PASS
- `npm run gate` PASS at `ae6a9bdd82bc588a1df511b397a8381da7ca78ff`

### TypeScript production comment audit

| path                                                                                               | symbol or decision                                                     | kind                                | current comment                                          | decision           | required maintenance knowledge                                                                                                                                     | action                                                                                          | reviewer note                                                        |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `sincromisor-frontend/src/character/motionEvaluation/motionReplayRawResultSchema.ts`               | `SincroMotionReplayRawResultFrame` / `parseMotionReplayRawResultFrame` | schema/parser                       | new file, no existing comment                            | add                | raw slot は plain JSON subset のみ受け入れる。`timing.mediaTimeMs` は replay frame boundary。欠落 slot は fallback 対象ではなく、parse error は slot/path を返す。 | module TSDoc、public type/parser TSDoc、non-JSON preflight を追加。                             | runtime class instance が通らず slot detail が出ることを test 済み。 |
| `sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts`                        | `MotionReplayPlayerOptions.applyRawResult`                             | public callback boundary            | module comment は raw mode reserved/unsupported 前提     | rewrite / add      | callback は raw normalizer と VRM side effect の境界。callback 欠落時だけ unsupported。context semantics は pose snapshot replay と同じ。                          | module comment を更新し、option TSDoc を追加。                                                  | `unsupported_mode` が callback 欠落時だけ出ることを test 済み。      |
| `sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts`                        | raw slot missing fallback non-adoption                                 | fallback decision                   | no explicit comment                                      | add                | raw mode は pose snapshot に暗黙 fallback しない。録画が raw を持たない場合は `missing_mediapipe_raw_result`。                                                     | error code と分岐を追加。コメントは public error code と docs に集約。                          | missing raw error を test 済み。                                     |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts`           | MediaPipe raw serializer boundary                                      | boundary                            | new file, no existing comment                            | add                | landmark/category/matrix だけをコピーし、mask/image/video/crop/task instance は保存しない。空 raw は録画しない。                                                   | module TSDoc と exported serializer の TSDoc を追加。                                           | serializer output は JSON-safe schema/parser 側でも検証される。      |
| `sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTrackerNormalizer.ts`               | `SincroPoseLandmarkerResultInput`                                      | public export / normalizer boundary | normalizer function comment only                         | add                | live MediaPipe class と replay plain object は同じ normalizer を通る。segmentation masks と task lifecycle は読まない。                                            | structural input type の TSDoc を追加し、normalizer input を class 型から structural 型へ変更。 | class instance を replay parser が保持しない境界と対応。             |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts`                     | manifest build metadata / `configHash`                                 | boundary / metadata decision        | module comment kept                                      | keep / add in docs | package versions は Vite define 由来で、欠落時は `unknown`。config hash は performance profile と retarget config pipeline の stable JSON。                        | private helper は命名と docs で十分と判断し、public comment は追加しない。design docs に同期。  | manifest field は recorder test と gate build で確認。               |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugReplayRuntime.ts`                           | `applyReplayRawResult` / raw normalized snapshot generation            | lifecycle / boundary                | module comment already describes replay-derived state    | keep               | raw Pose/Face/Hand/Gesture は既存 normalizer を使う。Pose raw 欠落時は VRM pose を apply しない。Gesture は snapshot 非保持。                                      | private boundary のため TSDoc は追加せず、既存 module comment を維持。                          | raw replay player tests と build で import/type 境界を確認。         |
| `documents/design/frontend/character/tracking.md`, `documents/design/frontend/character/motion.md` | raw replay design docs                                                 | docs                                | previous docs described raw mode as reserved/unsupported | rewrite            | raw replay supported behavior、missing/parse errors、manifest metadata、video re-inference 非対象、v1 optional raw slot。                                          | stale unsupported text を更新。                                                                 | docs sync 済み。                                                     |

TODO は追加していない。既存の raw mode unsupported 前提コメント/文書は stale にならないよう更新した。

## attempt 2

### 評価 FAIL への対応

- evaluator 指摘どおり、`mediaPipeRawResultSerializer.ts` の module comment だけでは public boundary の保守知識が symbol ごとに残っていなかった。
- 実装挙動は変更せず、exported type と exported serializer functions それぞれに TSDoc を追加した。
- 各 TSDoc では、受け入れる入力、保存する JSON subset、`undefined` になる条件またはならない契約、保持しない MediaPipe runtime / transferable object、replay 失敗時の見え方を symbol ごとに明記した。

### Verification

- `cd sincromisor-frontend && npm run check` PASS
- `git diff --check` PASS
- `npm run gate` PASS at `fe4974f36ffb0849436aab475d80e5627ade64f7`

### TypeScript production comment audit

| path                                                                                     | symbol or decision                       | kind                          | current comment                  | decision | required maintenance knowledge                                                                                                                                                                                                                                                                                               | action                       | reviewer note                                           |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------- | -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `TrackerRuntimeMediaPipeRawResult`       | public export / boundary type | attempt 1 では module TSDoc のみ | add      | slot は serializer 済み plain JSON subset。`unknown` は replay parser が slot schema と non-JSON を検証するため。timing は media time と video size。                                                                                                                                                                        | type 固有 TSDoc を追加。     | 実コードと audit を一致させた。                         |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `createTrackerRuntimeMediaPipeRawResult` | public serializer combiner    | attempt 1 では module TSDoc のみ | add      | 入力 slot と timing、全 slot undefined なら return undefined、空 raw を録画済みにしない、runtime/transferable を保持しない、raw slot 欠落は replay で `missing_mediapipe_raw_result`。                                                                                                                                       | function 固有 TSDoc を追加。 | 指摘された undefined 条件をこの symbol で明記。         |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `serializePoseLandmarkerResult`          | public serializer function    | attempt 1 では module TSDoc のみ | add      | live full-frame pose result を受け入れ、landmarks/worldLandmarks の数値 field だけ保存。segmentation mask/runtime object は保存しない。検出なしは caller が slot undefined にし、この関数は undefined を返さない。未保存 field 依存は parse/normalize 欠落として見える。                                                     | function 固有 TSDoc を追加。 | replay 失敗時の見え方も記録。                           |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `serializeHandLandmarkerResult`          | public serializer function    | attempt 1 では module TSDoc のみ | add      | full-frame hand fallback result を受け入れ、landmarks/worldLandmarks/handedness を保存。ROI crop context、runtime/transferable は保持しない。検出なしは caller が slot undefined にし、この関数は undefined を返さない。crop context 必須 raw は side assignment/座標不一致として見える。                                    | function 固有 TSDoc を追加。 | ROI raw を保存しない設計理由と failure surface を明記。 |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `serializeFaceLandmarkerResult`          | public serializer function    | attempt 1 では module TSDoc のみ | add      | full-frame face result を受け入れ、face landmarks/blendshape category/matrix の数値/文字列 field だけ保存。mask/image/video/task instance は保持しない。検出なしは caller が slot undefined にし、この関数は undefined を返さない。未保存 runtime field 依存は parse/normalize error または face snapshot 欠落として見える。 | function 固有 TSDoc を追加。 | 保存 subset と保持しない object を symbol に記録。      |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `serializeGestureRecognizerResult`       | public serializer function    | attempt 1 では module TSDoc のみ | add      | gesture result を受け入れ、hand/world landmarks、handedness、gesture category を保存。task instance/image/video/transferable は保持しない。検出なしは caller が slot undefined にし、この関数は undefined を返さない。現行 snapshot は gesture を保持しないため失敗は visual motion ではなく parse/normalize 境界に出る。    | function 固有 TSDoc を追加。 | Gesture の非 visual reflection も明記。                 |

TODO は追加していない。attempt 1 の `mediaPipeRawResultSerializer.ts` audit にあった「exported serializer の TSDoc を追加」は attempt 2 の実コードで充足した。

## attempt 3

### 再評価 FAIL への対応

- attempt 2 の serializer TSDoc は「検出結果が無い場合は呼び出し側が slot undefined にする」と書いていたが、実装では MediaPipe inference が result を返した場合、empty landmark/category arrays でも serializer が raw slot object を返す。
- 実装挙動は変更せず、TSDoc を実コードに合わせて修正した。
- `undefined` は serializer 関数の empty result 判定ではなく、tracker 側で model 未ロード、inference 未実行、gesture の hand prerequisite 不成立、inference failure、ROI のみで full-frame raw 対象 inference が未実行、または全 slot unavailable のときに現れる、と明記した。

### Verification

- `cd sincromisor-frontend && npm run check` PASS
- `git diff --check` PASS
- `npm run gate` PASS at `9d239acb03e57a0dcf03e4908b907997816eeaeb`

### TypeScript production comment audit

| path                                                                                     | symbol or decision                       | kind                       | current comment                                                                     | decision | required maintenance knowledge                                                                                                                                                                                                                                                                      | action                                                                                                          | reviewer note                                                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | module boundary                          | boundary                   | attempt 2 では slot unavailable を serializer 側の未対応/検出なしと読める           | rewrite  | slot が作られない状態は tracker 側の model 未ロード、inference 未実行、inference failure、gesture hand prerequisite 不成立など。empty arrays の result は raw slot object として保存される。                                                                                                        | module TSDoc を修正。                                                                                           | 実装挙動は変更なし。                                                                                  |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `createTrackerRuntimeMediaPipeRawResult` | public serializer combiner | attempt 2 は全 slot undefined 条件の背景が不足                                      | rewrite  | 全 slot `undefined` は upstream tracker が raw slot を作れない状態の集約。empty raw slot object ではなく、slot 自体が unavailable の場合のみ `undefined`。                                                                                                                                          | TSDoc の undefined 条件を model 未ロード / inference 未実行 / gesture prerequisite / inference failure に修正。 | raw slot 欠落は replay で `missing_mediapipe_raw_result`。                                            |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `serializePoseLandmarkerResult`          | public serializer function | attempt 2 は「検出結果が無い場合は caller が undefined」と書き、empty arrays と矛盾 | rewrite  | full-frame pose inference が result を返したら empty arrays でも raw slot object を返す。この関数は `undefined` を返さず、slot undefined は model 未ロード/inference 未実行など呼ばれない状態。保存 subset は landmarks/worldLandmarks の数値 field。                                               | TSDoc を実コードに合わせて修正。                                                                                | failure surface は parse/normalize 欠落として記録。                                                   |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `serializeHandLandmarkerResult`          | public serializer function | attempt 2 は「検出結果が無い場合は caller が undefined」と書き、empty arrays と矛盾 | rewrite  | full-frame hand fallback inference が result を返したら empty arrays でも raw slot object を返す。この関数は `undefined` を返さない。slot undefined は model 未ロード、ROI tracking のみで full-frame fallback 未実行、inference failure など。保存 subset は landmarks/worldLandmarks/handedness。 | TSDoc を実コードに合わせて修正。                                                                                | ROI crop context 非保持と side assignment/座標不一致の見え方も維持。                                  |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `serializeFaceLandmarkerResult`          | public serializer function | attempt 2 は「検出結果が無い場合は caller が undefined」と書き、empty arrays と矛盾 | rewrite  | full-frame face inference が result を返したら empty arrays でも raw slot object を返す。この関数は `undefined` を返さない。slot undefined は model 未ロード、ROI inference のみで full-frame inference 未実行、inference failure など。保存 subset は landmarks/blendshape category/matrix。       | TSDoc を実コードに合わせて修正。                                                                                | runtime field 依存時の parse/normalize error または face snapshot 欠落を維持。                        |
| `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts` | `serializeGestureRecognizerResult`       | public serializer function | attempt 2 は「検出結果が無い場合は caller が undefined」と書き、empty arrays と矛盾 | rewrite  | gesture inference が result を返したら empty arrays でも raw slot object を返す。この関数は `undefined` を返さない。slot undefined は hand prerequisite 不成立、model 未ロード、inference failure など。保存 subset は hand/world landmarks、handedness、gesture category。                         | TSDoc を実コードに合わせて修正。                                                                                | 現行 snapshot は gesture を保持しないため、失敗は visual motion ではなく parse/normalize 境界に出る。 |

attempt 2 の audit は過去ログとして残し、attempt 3 の audit で実コードと一致する契約に訂正した。TODO は追加していない。
