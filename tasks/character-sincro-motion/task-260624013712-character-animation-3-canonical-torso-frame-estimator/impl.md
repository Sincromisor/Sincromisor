# Implementation Log: task-260624013712-character-animation-3-canonical-torso-frame-estimator

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / review.md 申し送りへの対応

- hip world target 欠損時は `hipCenter` を合成せず、`previous.torso.hipCenter` が finite の場合だけ引き継ぐ実装にした。`calibration.torsoScale` は `torsoScale` fallback にだけ使い、synthetic hip center は作っていない。
- 前フレームなしの front 符号は、Face が検出済みかつ confidence `>= 0.08` のときだけ `normalize([sin(yawRad), 0, cos(yawRad)])` を hint にした。Face 未使用時や `abs(yawRad) > pi / 2` では neutral front hint を使う。
- default calibration は依存タスクで export 済みの `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` に合わせた。
- tuple math は estimator 本体から分離した。torso 推定の主責務と、finite / normalized tuple 演算を分けて、コード構造ルールのサイズ目安内に収めるため。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に torso frame 推定の入力優先順位、front flip reject、Face yaw fallback、calibration fallback を同期した。

### 検証

- `cd sincromisor-frontend && npm run test -- canonicalTorsoFrameEstimator`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run tasks:check`: 初回は root `node_modules/yaml` が worktree に無く失敗。`npm ci --ignore-scripts` で lockfile どおり root 依存を配置後 PASS。
- `npm run gate`: PASS (lint / build / test)

### 残リスク

- estimator は pure function として追加しただけで、motion-debug frame への保存や腕 feature 抽出への接続は後続タスク範囲。

## attempt 2

### 判断 / eval.md FAIL への対応

- `pose.upperBody.hipCenterTracked === false` は world hip target の採用可否には使わず、評価指摘どおり warning と confidence clamp の理由として扱うようにした。
- shoulder / hip world target がどちらも有効で高 confidence でも、`hipCenterTracked: false` の場合は `confidence` を最大 `0.45` に抑える。
- 回帰テストとして、有効な左右 shoulder / hip world target と高 confidence を与えつつ `hipCenterTracked: false` にしたケースを追加し、`missing_world_coordinates` warning と `confidence <= 0.45` を確認した。

### ドキュメント同期

- 公開挙動・設計文書の契約変更ではなく、attempt 1 で同期済みの「`hipCenterTracked === false` は warning / confidence clamp に使う」契約へ実装を合わせる修正のため、追加の文書差分は不要。

### 検証

- `cd sincromisor-frontend && npm run test -- canonicalTorsoFrameEstimator`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run tasks:check`: PASS
- `npm run gate`: PASS (dirty tree, commit 前)

### 残リスク

- attempt 1 と同じく、estimator の motion-debug snapshot 保存や arm feature 抽出への接続は後続タスク範囲。
