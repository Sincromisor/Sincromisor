# Implementation Log: task-260627180726-character-animation-3-0-phase-9-finger-curl-pose-mapping

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- review.md の依存確認に従い、HEAD に `VrmPoseLayerKind` の `semantic` kind が存在することを確認して実装を継続した。
- `FingerCurlPoseLayerResult.layer` は optional とし、指定 side の全 finger chain が欠損して `ownedBones` が空の場合は layer を返さず、debug snapshot と `missing_finger_chain:<side>:<group>` warning だけを返す形にした。
- previous curl 保持は `previous.side === input.side` の場合だけ有効にし、side mismatch は previous 欠損相当として扱った。
- input 境界は `SincroHandMotionSnapshot` / `MotionIntentState` / `AvatarMotionProfile` / caller 指定 `mediaTimeMs` / optional previous debug に限定した。raw landmarks、MediaPipe raw result、VRM Object3D、raw bone node は参照していない。
- quaternion は計算中のみ `THREE.Quaternion` を使い、layer / debug には plain `{ x, y, z, w }` だけを保存する判断にした。
- composer policy は finger layer が生成する full finger chain を unsupported 扱いしないよう拡張した。ただし helper 自体が完成版 `AvatarMotionProfile.capabilities.fingerChains` で欠損 bone を除外するため、Minimal profile が持たない distal/intermediate の missing 判定は helper 側の capability を正本にする。
- 公開挙動 / developer-visible motion contract の追加に該当するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` を同じ変更で同期した。

### 確認結果

- `cd sincromisor-frontend && npm run test -- fingerCurlPoseLayer` PASS。
- `cd sincromisor-frontend && npm run test -- semanticMotionPoseLayer` PASS。
- `cd sincromisor-frontend && npm run test -- vrmPoseComposer` PASS。
- `cd sincromisor-frontend && npm run check` PASS。
- `cd sincromisor-frontend && npm run build` PASS。
- `npm run tasks:check` PASS。
- `npm run gate` PASS。lint / build / full frontend test が通過し、full test は 41 files / 324 tests PASS。

### ハマった点 / 回避策

- 実装 worktree に root `node_modules` が無く `npm run tasks:check` が `yaml` module 解決で失敗した。main checkout の root `node_modules` を一時 symlink して確認し、symlink はコミット前に削除した。
- 初期実装では finger curl helper とテストがファイルサイズ規約を超えたため、bone mapping / quaternion 生成とテスト fixture を隣接ファイルへ分割した。

### 未実行確認 / 残リスク

- 実 VRM モデルでの視覚確認は未実行。本タスクは本番 character update への接続をスコープ外としており、pure helper と composer policy / unit test / docs の確認に留めた。
- `curlScale < 1` の場合、intent override のしきい値は helper 内の group curl に適用後、profile scale で弱まる。これは task.md の「override 後に curlScale を掛けて最終 clamp」と読む判断に基づく。
