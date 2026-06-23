# Evaluation: task-260624013712-character-animation-3-canonical-torso-frame-estimator

## 判定
PASS

## 受け入れ条件チェックリスト
- [✓] `canonicalTorsoFrameEstimator.ts` を追加し、`estimateCanonicalTorsoFrame(input)`、`CanonicalTorsoFrameInput`、`CanonicalTorsoFrameResult` を export している。
- [✓] shoulder world target は `world.hasWorldCoordinates === true` かつ `normalizedX/Y/Z` が finite の場合だけ使い、`rawX/Y/Z` を主入力にしていない。
- [✓] 左右 hip world target が有効な場合だけ `hipCenter` と `bodyUp` を hip 由来で作っている。
- [✓] hip world target 欠損時に synthetic hip center を作らず、`previous.torso.hipCenter` が finite の場合だけ引き継いでいる。
- [✓] hip world target 欠損時の `bodyUp` は previous、なければ neutral を使い、`calibration.torsoScale` は `torsoScale` fallback にだけ使っている。
- [✓] `pose.upperBody.hipCenterTracked === false` は `missing_world_coordinates` warning と confidence clamp の理由として使っている。attempt 2 で `usedFallback` 相当の clamp 条件へ追加され、world shoulder/hip target が有効な高 confidence 入力でも `confidence=0.45` に抑える回帰テストが追加された。
- [✓] `bodyFront` は `normalize(cross(bodyRight, bodyUp))` を候補にし、前フレームとの dot が負なら前フレームを維持して `front_flip_rejected` を付けている。
- [✓] 前フレームがない場合の Face yaw hint は `normalize([sin(yawRad), 0, cos(yawRad)])` を使い、無効時は neutral hint に fallback して符号決定している。
- [✓] Face 未入力・未検出・低 confidence・yaw 範囲外時の `yawRad` / yaw hint fallback は契約どおり。`yawRad` は previous / calibration 順に fallback し、範囲外 yaw は hint に使わない。
- [✓] 全欠損時は deterministic neutral frame、finite normalized axes、`confidence=0` を返す。
- [✓] result は `CanonicalTorsoFrame` と `CanonicalCalibrationSnapshot` を含み、calibration 未指定時は default snapshot を使い、有効な肩幅で `calibration.shoulderWidth` を更新している。
- [✓] `canonicalTorsoFrameEstimator.test.ts` は有効 shoulder/hip、hip 欠損 fallback、`hipCenterTracked === false` confidence clamp、front flip reject、Face yaw fallback、Face yaw hint、全欠損 neutral を検証している。
- [✓] `documents/design/frontend/character/motion.md` に torso frame 推定の入力優先順位、front flip reject、Face yaw fallback、calibration fallback が同期されている。

## テスト結果
- `npm run gate` を評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-bb09d0a48fbb-ZPgPI0` で実行: passed。
- gate 詳細: `gate:lint` CACHE HIT、`gate:build` CACHE HIT、`gate:test` CACHE HIT。対象は `bb09d0a` の clean tree。
- test summary: `54 passed (54)`。
- カバレッジ評価: 受け入れ条件の主要分岐は focused unit test で十分に押さえられている。前回不足していた `hipCenterTracked === false` かつ hip world target 有効時の confidence clamp も追加テストで確認済み。

## ドキュメント整合性
- 公開通信契約や外部 API の変更はない。
- character motion の内部 contract 変更として `documents/design/frontend/character/motion.md` は attempt 1 で更新済み。attempt 2 は既存文書契約どおりに実装を合わせる修正で、追加の文書差分は不要。

## 残課題（FAIL の場合）
- なし。
