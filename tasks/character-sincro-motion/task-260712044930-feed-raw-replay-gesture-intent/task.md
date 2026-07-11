# Feed replayed raw gestures into replay motion intent

## 背景 / 目的

`mediapipe-raw-result` replay は Gesture result を snapshot 化するが、replay-derived MotionIntent には渡していない。Phase 1/9 の raw replay で live と同じ normalized gesture input を再利用できるようにする。

## 完了条件（受け入れ条件）

- [ ] raw replay frame の Gesture slot が valid な場合、既存 `toGestureIntentObservation(snapshot)` を直接使って同 frame の replay-derived `MotionIntentEstimator` 入力へ渡す。新規adapterや別mappingは追加しない。
- [ ] side `source:"gesture-recognizer"` だけが `{label,confidence}` に写り、両side欠損または`source:"lost"`なら`undefined`になる既存contractを維持する。空label/non-finite値の拒否はraw schema/normalizerの責務とし、この接続で再検証しない。
- [ ] Gesture slot missing/skipped/lostではobservationを渡さず追加warningなし、invalid schemaでは既存raw replay parse warningを維持し追加warningを作らない。全経路で`intent.gesture`はfallback推定結果（該当なしなら`none`）とし、保存済み`frame.intent`で補完しない。
- [ ] raw label/category object を estimator に直接渡さず、live と同じ normalized label/side/confidence 境界を通す。
- [ ] 連続autoplay/隣接`stepReplay(current+1)`はhysteresisを維持し、非連続seek、後方seek、stop、別log loadだけ`resetTemporalState()`をstep適用前に呼ぶ。
- [ ] valid gesture、missing、invalid、seek/reset の focused replay tests で intent と warning を一意に固定する。
- [ ] `documents/design/frontend/character/motion.md` に raw replay intent 入力と非補完境界を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録し、raw parser/normalizer/intent/reset boundary を対象にする。

## 設計判断（着手前に確定済み）

- ROI crop context や MediaPipe runtime object は保存対象へ追加しない。plain JSON slot から再構成できる normalized observation だけを使う。
- saved intent を優先しない。raw replay は下流を再計算する mode であり、final-pose playback と責務を分ける。

## スコープ境界

- 本タスク: raw Gesture snapshot→intent接続、reset、tests/docs。
- スコープ外: ROI context保存、video再推論、Gesture Recognizer runtime変更、live estimator tuning。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/pages/motionDebug/motionDebugReplayRuntime.ts:20-39` は raw result normalizer と intent estimator を同じ runtime に持つ。
- 同 file `:83-90` が replay-derived estimator state、`:201-207` が source reset を所有する。
- `sincromisor-frontend/src/features/gaze/trackingRuntime/mediaPipeRawResultSerializer.ts:138` が raw Gesture の JSON subset 境界である。

## テスト

- frontend check / build / replay focused tests、`npm run gate`、`npm run tasks:check`。

## ドキュメント同期の要否

要。developer-visible replay 挙動が変わるため motion.md を同期する。log schemaと通信契約は変更しない。

## Comment audit / 評価条件

`impl.md` に `path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note` で全変更symbol/decisionを記録する。最低対象は既存`toGestureIntentObservation`再利用判断、raw apply→intent boundary、continuous/non-continuous seek reset。弱い/stale commentのrewrite/deleteと省略理由を記録する。評価者は全件照合し、raw object非漏出、missing/invalid warning、reset lifecycleを説明しないcommentやaudit不一致をFAILにする。
