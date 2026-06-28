# Implementation Log: task-260628161558-character-animation-3-0-phase-11-sequence-classifiers

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- review.md は APPROVED のため実装に進めた。
- sequence window は `temporal` / `intent` / `reliability` / `hand` の availability を保持し、classifier が作る `MotionPostProcessingResult.inputAvailability` では `canonical: false` と `temporal` / `intent` / `reliability` だけを写す方針にした。`hand` は feature 専用入力として post-processing availability へ出していない。
- `sideSwapSuspectCount` は intent arm warning の `left_right_swap_suspect` と、ReliabilityMap top-level / arm part / shoulder-elbow-wrist joint の `side_inconsistent` warning だけを読む実装にした。`components.side.reasonCodes` は使っていない。
- classifier は `MotionIntentEstimator.update()`、live runtime、replay runtime へ接続せず、別 helper として event と correction-only result を返すだけにした。
- public WebRTC / backend 契約は変更なし。developer-visible な motion post-processing contract が増えたため、`documents/design/frontend/character/motion.md` を同一コミットで同期した。

### 確認

- `npm run test -- motionSequenceWindow motionSequenceClassifier`
- `npm run test -- motionIntentEstimator`
- `npm run test -- motionSequenceWindow motionSequenceClassifier motionIntentEstimator`
- `npm run build`
- `npm run check`
- `npm run tasks:check`
- `npm run gate`

### ハマった点 / 回避

- worktree root に `node_modules` が無く、初回の `npm run tasks:check` は `yaml` が解決できず失敗した。`package-lock.json` に基づいて `npm install --offline` を worktree root で実行し、root 依存だけを展開してから再実行した。

### 残リスク

- rule-based baseline のしきい値は task.md の固定値どおりで、実データでの閾値調整や learned classifier 化は後続タスクの対象。
