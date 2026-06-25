# Review: task-260626014928-character-animation-3-phase-7-online-calibration-guard

## 判定
APPROVED

前回 blocking だった gate close 後の candidate 扱いと parse API / 失敗時挙動は、現行 task.md で固定されている。残る表現の揺れと file:line ずれは実装者への申し送りで足り、実装を止める High はない。

## 指摘事項
- [Medium] `task.md:14` は gate close 時に「state を更新せず」と書く一方、`task.md:77` と `task.md:19` は gate close frame で `candidate` を破棄し、次回 open 時に `stableDurationMs` を 0 から再開することを求めている。期待値は後者で一意に読めるため blocking ではないが、実装時は「calibration 値は更新しないが、candidate reset と freezeReasons 更新は行う」と解釈すること。
- [Low] `task.md:105` の roadmap 参照行は現状とずれている。candidate / committed、drift guard、変更禁止対象の記述は `documents/research/character_animation/roadmap.md:441` から `:444` にある。

## 実装者への申し送り
- 前回 High のうち、gate close 後の candidate 継続性は `task.md:77` と `task.md:19` で解消済み。closed frame 後に再 open しても、前回 candidate の安定時間を committed promotion に使わない。
- 前回 High のうち、parse API / 失敗時挙動は `task.md:11`、`task.md:18`、`task.md:19` で解消済み。unknown freeze reason、`NaN` / `Infinity`、negative duration、extra key、runtime object 風 value は reject する。
- `drift_clamped` は `task.md:79` の通り freeze ではなく debug reason として扱い、clamp 済み値で candidate / committed を更新する。`drift_clamped` だけを理由に candidate を破棄しない。
- `CanonicalCalibrationSnapshot` は `source: "online"` を既に許容しており、calibration shape は `sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:56` から `:66`、schema validation は `:178` から `:193` にある。online state はこの shape を clone して扱う方針で整合している。
- 新規 `src/character/calibration/` は依存タスクの `initialSincroCalibration.ts` と同じ所在に置く前提で自然だが、依存タスクが未実装の状態では `npm run test -- initialSincroCalibration` は通らない可能性がある。実装順と依存解決状態を確認してから着手すること。
