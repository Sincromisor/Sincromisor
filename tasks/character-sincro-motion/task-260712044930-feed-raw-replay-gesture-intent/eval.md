# Evaluation: task-260712044930-feed-raw-replay-gesture-intent

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] raw replay の valid Gesture slot は既存 `normalizeSincroGestureRecognizerResult()` で `SincroGestureMotionSnapshot` に正規化された後、既存 `toGestureIntentObservation(snapshot)` を直接通って同 frame の replay-derived `MotionIntentEstimator` へ渡る。新規 adapter / label mapping / side validation はない。
- [✓] estimator に渡る gesture は既存 helper が作る `{ left?, right? }` と各 `{ label, confidence }` だけで、MediaPipe raw category / label object は漏出しない。
- [✓] `source: "gesture-recognizer"` の side だけが observation へ写り、両 side 欠損または `source: "lost"` は `undefined` になる既存 helper contract を維持する。接続側は空 label / non-finite confidence を再検証しない。
- [✓] Gesture slot missing / skipped / lost は observation なしとして estimator の通常 fallback に委ねられ、接続専用 warning を追加しない。
- [✓] invalid Gesture schema は `MotionReplayPlayer` の既存 `parse_error` と gesture slot parse error を返し、runtime callback / estimator へ到達しない。追加 warning はない。
- [✓] replay-derived intent は全経路で estimator の出力であり、saved `context.frame.intent` を参照しない。focused test は saved thumbs-up intent が missing / lost gesture 経路へ補完されないことを固定する。
- [✓] autoplay は player が隣接 index を直接適用するため estimator state を維持する。手動 `stepReplay(current + 1)` も reset しない。
- [✓] 同一 frame、frame skip、後方 seek は `player.stepReplay()` より前に `resetTemporalState()` を呼ぶ。stop は player stop 後に state を破棄し、別 log load は frame 適用前に reset する。既存 replay の restart も start frame 適用前に reset する。
- [✓] focused tests は valid normalized gesture から pointing intent、missing / lost と saved intent 非補完、隣接 step 維持と非連続 seek reset、invalid raw Gesture の既存 parse error を検証する。
- [✓] `documents/design/frontend/character/motion.md` は raw Gesture の既存 normalizer/helper 再利用、raw / saved intent 非入力、warning 境界、continuous / reset lifecycle を同期している。
- [✓] TypeScript production comment audit は helper 再利用判断、raw apply→intent boundary、continuous / non-continuous reset、invalid parser boundary を指定列で網羅し、実コードと一致する。

## 実装照合所見

- raw object 非漏出: `applyReplayRawResult()` は raw Gesture を `normalizeReplayGesture()` へ渡し、`updateReplayIntent()` は snapshot 型だけを受け取る。最終 estimator input は `toGestureIntentObservation()` の戻り値だけである。
- warning ownership: category 欠損による fallback snapshot の warning は既存 raw normalizer 側の情報であり、intent 接続は warning を生成・複製しない。schema invalid は player parser で停止する。
- saved intent 非補完: `updateReplayIntent()` は `context` から `mediaTimeMs` だけを読み、`context.frame.intent` を読まない。viewer の saved intent layer と raw replay-derived intent の責務が分離される。
- reset ordering: `stepReplay()` は現在 index と要求 index を比較し、非隣接なら reset 後に player を呼ぶ。隣接 forward は state を保持する。load / stop / restart の既存 lifecycle reset も保持される。
- comment acceptance: `updateReplayIntent()` は normalized snapshot 限定、raw / saved intent 非補完、missing / lost と warning ownershipを説明する。`stepReplay()` は連続性判定と適用前 reset の理由を説明している。

## テスト結果

- `npm run gate`（評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-a9ea21962f1c-oo9ukt`、commit `a9ea21962f1c0b4e2c4dcce222ea2216fab22c59`、clean）: PASS。
- gate 内訳: `gate:lint` CACHE HIT PASS、`gate:build` CACHE HIT PASS、`gate:test` CACHE HIT PASS（515 passed / 2 skipped）。
- カバレッジ評価: task が要求する valid、missing / lost、invalid、saved intent 非補完、seek / reset の主要分岐は focused test と既存 player testsで十分に覆われている。独立 acceptance test の追加は不要と判断した。

## ドキュメント整合性

- developer-visible replay-derived intent と lifecycle の変更は `documents/design/frontend/character/motion.md` に同期済み。
- log schema、backend、WebRTC、runtime Gesture Recognizer の契約変更はない。

## 残課題（FAIL の場合）

- なし。

