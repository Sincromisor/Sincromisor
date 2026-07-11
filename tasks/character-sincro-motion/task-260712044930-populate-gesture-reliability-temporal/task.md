# Populate gesture reliability temporal component

## 背景 / 目的

Gesture reliability は stable duration で一時 spike を抑える一方、`components.temporal` は常に0/`no_observation`であり、debug 表示と component 合成が実際の安定性を表さない。Phase 4 の残差を contract 内で解消する。

## 完了条件（受け入れ条件）

- [ ] valid gesture観測では同一 side+label の継続時間から temporal score を `clamp(stableDurationMs / 160, 0, 1)` で生成する。0〜159msは `unstable_observation`（0msも観測あり）、160ms以上はreasonなし。`no_observation`はneutral placeholderだけに使う。
- [ ] label/side変更、confidence gate未満、mediaTime逆行、previous欠損はそのframeのvalid gestureを`source:"gesture"`のまま保ち、stableDuration=0、temporal score=0/`unstable_observation`で出力する。gesture欠損だけneutral/lostへ落とす。
- [ ] `finalWeight` は tracking/temporal/side/roi/cameraQuality の最小値にする。従来の別建て 0.5 cap は削除し、160ms時点で同等以上へ連続遷移する。
- [ ] ReliabilityMap schemaVersion は維持し、旧 replay log の0 componentもparse可能にする。
- [ ] boundary値 0/159/160ms、label/side変更、timestamp逆行の unit tests と motion intent gate regression test を追加する。
- [ ] `documents/design/frontend/character/tracking.md` と `motion.md`、roadmap の Phase 4 現在地を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録し、threshold、reset、weight合成を対象にする。

## 設計判断（着手前に確定済み）

- 新しい temporal filter/state class は作らず、既存 stableDurationMs を component に写像する。同じ安定性を二重管理しないためである。
- schema field は追加しない。既存 component slot の意味を実値にする変更である。

## スコープ境界

- 本タスク: component計算、weight合成、tests/docs/roadmap更新。
- スコープ外: 実カメラ閾値tuning、sequence classifier、Gesture runtime cadence。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/character/reliability/gestureReliabilityEstimator.ts:80-96` は temporal を0固定し、stableDurationによる別capを使う。
- 同 file `:98-113` が ReliabilityMap.gesture 出力を組み立てる。
- `sincromisor-frontend/src/character/reliability/__tests__/gestureReliabilityEstimator.test.ts:95-147` に現行component/reset coverageがある。

## テスト

- frontend check / build / focused test、`npm run gate`、`npm run tasks:check`。

## ドキュメント同期の要否

要。developer-visible reliability contract と roadmap の残差判定が変わるため tracking/motion/roadmapを同期する。通信契約は変更しない。

## Comment audit / 評価条件

`impl.md` に `path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note` で全変更symbol/decisionを記録する。最低対象は`createGestureReliability`、temporal component mapping、stable duration reset、既存TSDoc `gestureReliabilityEstimator.ts:57-69`。弱い/stale commentはrewrite/deleteし、省略理由を記録する。評価者は全件照合し、valid 0msとneutral欠損の区別、threshold/reset/min合成を説明しないcomment、定型audit、実装不一致をFAILにする。
