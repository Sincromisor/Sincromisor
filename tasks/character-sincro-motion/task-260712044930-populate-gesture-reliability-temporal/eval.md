# Evaluation: task-260712044930-populate-gesture-reliability-temporal

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] valid gesture observation の temporal score は `clamp(stableDurationMs / 160, 0, 1)` で生成される。
- [✓] valid 0ms は `source: "gesture"`、temporal score 0、`unstable_observation` であり、観測欠損と区別される。159ms は `159 / 160` と同 reason、160ms は score 1 / reason なしになる。
- [✓] gesture 欠損だけが `source: "neutral"` / state `lost` / `no_observation` placeholder へ落ちる。
- [✓] previous 欠損、label 変更、side 変更、confidence `< 0.70`、media time 逆行 / 非増加は当該 valid frame の `stableDurationMs` を0へ reset するが、`source: "gesture"`、label、side、confidence、`lastUpdatedAtMs` と full component output を保持する。
- [✓] stable duration の加算は同一 side + label、confidence gate 通過、previous timestamp あり、正の finite dt の場合だけである。dt は既存契約どおり最大1000msに clamp される。
- [✓] `finalWeight` は tracking / temporal / side / roi / cameraQuality の5 component score の最小値である。旧 stable duration の別建て0.5 capはなく、160ms frame は他 component が許す weight へ遷移する。
- [✓] `RELIABILITY_MAP_SCHEMA_VERSION` は `sincro.reliability-map.v1` のままである。旧 gesture temporal score 0 / `no_observation` の map を current parser が受理する regression test がある。
- [✓] unit tests は0 / 159 / 160ms、label変更、side変更、low confidence、timestamp逆行、previous欠損相当の初回 valid frame、neutral欠損を固定する。
- [✓] MotionIntent regression test は0ms gesture reliability では gate が閉じて `gesture_unstable`、160msでは `finalWeight > 0.65` となり pointing intent が成立することを検証する。
- [✓] `documents/design/frontend/character/tracking.md` と `motion.md` は threshold、reset、valid / missing の区別、5 component min、schema v1互換を同期している。
- [✓] roadmap は Phase 4 の temporal component 実値化を現在地へ反映し、残差を実カメラ flicker / false-positive 確認へ更新している。
- [✓] TypeScript production comment audit は public estimator、temporal mapping、stable reset、reason persistence contract を指定列で網羅し、実コードと一致する。

## 実装照合所見

- 0ms と欠損の区別: observation 選択後に temporal を評価するため、初回・reset frame も neutral early return へ入らない。neutral は observation 自体がない場合に限定される。
- reset state: `calculateStableDurationMs()` は reset 条件で duration だけを0にする。caller はその後も gesture source、選択済み side / label / confidence、全 component、caller の media time を通常どおり出力する。
- min 合成: `Math.min()` の入力は明示的に5 componentだけで、stable duration による追加 cap はない。最後の `clamp01` は component 異常値への安全境界であり、別 cap ではない。
- schema互換: field shape は変更されず、reason enum に `unstable_observation` を追加しただけで schemaVersion は維持される。旧 `no_observation` reason は削除されず parse test がある。
- intent gate: estimator は gesture reliability の finalWeight を実際に読み、0msと160msで semantic intent の結果が変わることを integration寄りの unit test で確認できる。
- comment acceptance: estimator TSDoc は valid 0ms / missing、160ms ramp、confidence / side / label / timestamp reset、5 component minを説明する。heuristic comment は閾値変更時の UX tradeoff と raw object 非入力境界も記録する。

## テスト結果

- `npm run gate`（評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-4ed2126530d6-CyLGDH`、commit `4ed2126530d6c926c698893762e318f8b033a93a`、clean）: PASS。
- gate 内訳: `gate:lint` CACHE HIT PASS、`gate:build` CACHE HIT PASS、`gate:test` CACHE HIT PASS（518 passed / 2 skipped）。
- カバレッジ評価: 0 / 159 / 160、neutral / valid reset、全 reset 原因、5 component min、旧 v1 parse、MotionIntent gate の主要契約は十分に覆われている。独立 acceptance test の追加は不要と判断した。

## ドキュメント整合性

- tracking / motion の設計正本と research roadmap は現行実装に同期している。
- 通信契約、ReliabilityMap field shape、schemaVersion の変更はない。

## 残課題（FAIL の場合）

- なし。

## その他所見

- 実カメラでの flicker / false-positive 確認は後続 baseline task の明示スコープであり、本タスクの PASS を妨げない。

