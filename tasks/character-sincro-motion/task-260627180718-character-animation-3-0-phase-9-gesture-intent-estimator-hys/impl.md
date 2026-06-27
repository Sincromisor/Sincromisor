# Implementation Log: task-260627180718-character-animation-3-0-phase-9-gesture-intent-estimator-hys

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- review.md は APPROVED だったため実装に着手した。
- `wave` の `minimumDurationMs` / `cooldownMs` は `config.timing` に含めず、`config.wave` だけで正規化する schema にした。
- fallback の torso confidence は `reliability?.parts.torso.finalWeight` を優先し、ReliabilityMap 欠損時だけ左右 temporal arm confidence 平均を使うようにした。
- confidence gate は既定値を固定し、`config.thresholds` 指定時だけ override する。ReliabilityMap 欠損時は hand side confidence のみで判定し、`low_hand_reliability` は出さない。
- `createMotionIntentState(input, config?)` は単発 helper として `new MotionIntentEstimator(config).update(input)` に閉じ、過去 frame が必要な semantic intent は初回に発火しない挙動にした。
- `dtMs <= 0` / `dtMs > 250` / 非 finite dt は candidate / fallback / wave counters を進めず、`invalid_dt` warning を返す。初回 frame は previous time が無いため invalid dt にはしない。
- `tasks:check` 実行時、実装 worktree の root `node_modules` symlink が未展開で `yaml` を解決できなかったため、main checkout の root `node_modules` への symlink を一時作成して確認した。確認後に symlink は削除済み。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` の `MotionIntentState` 節を更新し、input boundary、gesture mapping、confidence gate、minimum duration / cooldown、wave 発火条件、nearFace / clapLike / guarded、lost / fallback、reset / invalid dt、Gesture Recognizer を主制御器にしない方針を同期した。
- WebRTC / backend / compose / env 契約は変更していないため、関連 contract document の更新は不要。

### 確認結果

- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`: PASS
- `cd sincromisor-frontend && npm run test -- motionIntentState`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS（既存の Vite chunk size warning は継続）
- `cd sincromisor-frontend && npm run test`: PASS（38 files / 306 tests）
- `npm run tasks:check`: PASS
- `npm run gate`: PASS（commit `996d7449a9cf836ed282e4637a32af95093abae4`、lint / build / test）

### 未実行 / 残リスク

- ブラウザ実機、カメラ、MediaPipe Gesture Recognizer 実呼び、VRM 適用は未実行。本タスクのスコープ外で、後続の接続 task が扱う。
- estimator は保存可能な `MotionIntentState` を返すが、motion-debug recording への `frame.intent` 保存や本番 motion pipeline への接続はまだ行っていない。

## attempt 2

### 判断 / 評価 FAIL 対応

- 評価 FAIL の指摘どおり、attempt 1 では `updateSide()` が all-arms fallback を predicted / recovering semantic hold より先に処理していた。
- side ごとの `getPredictedSemanticHold()` を fallback commit より前に移動し、前回 semantic intent の hold が成立する side では all-arms fallback が active でも `fallback` / `fallback_active` に切り替えないようにした。
- side swap hold は従来どおり最優先に残した。これは `side_inconsistent` 後に左右の前回 semantic intent を同じ side に保持する別要件のため。
- 追加 regression test では、左右 semantic intent 確定後に両腕 `predicted` / `recovering`、confidence `< 0.15`、torso reliability `< 0.15` を 300ms 以上 500ms 未満継続させ、前回 semantic が保持され `fallback_active` が付かないことを検証した。あわせて 500ms 超過後は fallback へ落ちることも確認した。

### ドキュメント同期

- 公開 API / 通信契約 / developer-visible な仕様文言は変えていない。attempt 1 で同期済みの predicted semantic hold と fallback 優先規則の実装バグ修正に留まるため、追加ドキュメント同期は不要。

### 確認結果

- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`: PASS（15 tests）
- `npm run gate`: PASS（commit `b523cb0d1e8fcec3a95b24a6611718b20c9fbbd6`、lint / build / test、38 files / 308 tests）

### 未実行 / 残リスク

- attempt 1 と同じく、ブラウザ実機、カメラ、MediaPipe Gesture Recognizer 実呼び、VRM 適用は未実行。本タスクの接続外。
