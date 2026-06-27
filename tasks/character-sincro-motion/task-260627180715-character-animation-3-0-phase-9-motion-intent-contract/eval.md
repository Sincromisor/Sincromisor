# Evaluation: task-260627180715-character-animation-3-0-phase-9-motion-intent-contract

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `motionIntentState.ts` の追加と required export — commit `e49738b` で `MOTION_INTENT_SCHEMA_VERSION`、`ArmMotionIntent`、`TorsoMotionIntent`、`MotionIntentState`、`MotionIntentParseResult`、`parseMotionIntentState()`、`createDefaultMotionIntentState()`、`cloneMotionIntentState()` を追加。`MotionIntentWarningCode` も review.md の申し送りどおり export されている。
- [✓] `ArmMotionIntent` enum 固定 — `"tracking" | "wave" | "pointing" | "thumbsUp" | "peace" | "nearFace" | "explain" | "clapLike" | "guarded" | "lost" | "fallback"` に限定され、`motionIntentState.test.ts` の `rejects raw gesture labels and non-contract intent names` が `"thumbs_up"` / `"openPalm"` を reject することを確認している。
- [✓] `TorsoMotionIntent` enum 固定 — `"neutral" | "leaning" | "turning" | "settling"` に限定され、同 test で torso に `"wave"` を入れるケースが reject されている。
- [✓] `MotionIntentState` 最小 schema — 指定された `timestamp`、`arms.left/right`、`torso`、top-level `warnings` の shape を `z.object(...).strict()` と plain object check で固定し、`sourceGestureLabel` は optional string として arm side に閉じている。
- [✓] `MotionIntentWarningCode` 固定 — 9 種に限定され、`rejects unknown warning codes` が unknown enum を `invalid_state` として確認している。
- [✓] parser error code / 値域 / runtime object 境界 — `unknown_schema_version`、`invalid_state`、`out_of_range` を返す。`confidence` / `reliability` / `expressiveness` は `0..1`、time 系 scalar は finite `>= 0`。unit test は unknown schema、unknown intent、値域外 scalar、非 finite / function、extra key、Vector3 / Quaternion 風 field、class instance を検証している。
- [✓] default state — 左右腕は `tracking` / scalar `0` / `source: "fallback"`、torso は `neutral`、top-level warning は `fallback_active`。`mediaTimeMs` は caller 指定値を保存し、実装内に `performance.now()` 呼び出しはない。
- [✓] motion-debug log schema 互換 — `motionDebugLogSchema.ts` の `frame.intent` は `z.unknown().optional()` のまま維持され、log load 全体では strict validation していない。
- [✓] replay viewer intent layer — `intent` は `RESERVED_PHASE_1_LAYERS` から外れ、saved `frame.intent` のみを `parseMotionIntentState()` で検証する。missing は `not_recorded`、valid は `available`、invalid は `invalid`。live snapshot fallback は追加されていない。
- [✓] unit test 追加 / 更新 — `motionIntentState.test.ts` と `motionDebugViewerModel.test.ts` に valid state、unknown schema、unknown intent、値域外 scalar、runtime object 風 value、旧 log 欠損 `not_recorded`、schema invalid `invalid` の観点が入っている。
- [✓] task Markdown 混入の確認 — commit には task Markdown 8 件の整形差分が含まれるが、確認範囲では見出し前後の空行、TypeScript snippet の Prettier 整形などに留まり、task status / meta / 判定内容を変える運用上の問題は見つからなかった。`meta.yaml` は変更されていない。

## テスト結果

- `npm run gate`（評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-e49738bd2af5-cwqAsC`、HEAD `e49738b`、clean）: passed
    - `gate:lint`: CACHE HIT / passed。Markdown Prettier check も passed。
    - `gate:build`: CACHE HIT / passed。
    - `gate:test`: CACHE HIT / passed。293 tests passed。
- 追加の acceptance test は作成していない。既存 unit test とコードレビューで受け入れ条件の parser / viewer 境界を十分にカバーしていると判断した。
- カバレッジ評価: parser の enum / schemaVersion / scalar range / runtime object 風 value / clone / default と、viewer の saved intent 表示・欠損・invalid 分岐が直接検証されている。旧 log load 互換は `frame.intent` の unknown optional 維持をコード確認した。

## ドキュメント整合性

- 公開 WebRTC / backend 契約の変更はなし。
- developer-visible な `character/motionIntent` contract と motion-debug `frame.intent` optional slot の公開挙動が追加された。
- `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に `sincro.motion-intent.v1`、arm / torso enum、`sourceGestureLabel` 方針、`frame.intent` の optional unknown 境界、viewer の `available` / `invalid` / `not_recorded` 表示方針が同期済み。

## 残課題（FAIL の場合）

- なし。
