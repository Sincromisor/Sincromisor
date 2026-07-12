# Evaluation: task-260627141813-character-animation-3-phase-8-roi-cadence-fallback-docs

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] 依存成果物の存在確認 — `SincroHandMotionSnapshot`、`TrackerRuntimePoseOptions.hand`、`SincroTrackerWorkerResultMessage.hand`、`SincroTrackerWorkerStats.effectiveHandFps`、`SincroFaceMotionSnapshot.roi/source/warnings` は HEAD に存在する。
- [✓] `shouldRunTrackerFaceRoiInference()` 追加 — `trackerRuntimeCadence.ts` に追加され、Hand cadence は既存 `lastHandInferenceAtMs` / `targetHandInferenceFps` を維持し、Face ROI 既定 fps は `DEFAULT_TARGET_FACE_ROI_INFERENCE_FPS = 6`。
- [✓] `TrackerRuntimePoseOptions.faceRoi` 追加と未指定 disabled 互換 — `poseOptions.faceRoi?.enabled === true` の場合だけ有効化され、`TrackerRuntimePerceptionOptions` は追加されていない。
- [✓] full-frame Face cadence 維持 — attempt 2 で main-thread `runFaceInference()` は常に `faceTracker.detect()` を実行し、Face ROI は `runFaceRoiInference()` の補助 pass として分離された。Worker 側も `face` に full-frame `detect()` 結果、`faceRoi` に optional ROI pass を返す。
- [✓] `lastFaceRoiInferenceAtMs` 分離と Pose stale skip — Face ROI timestamp は別 field。fresh 判定は `mediaTimeMs - lastUpdatedAtMs > 250` で、skip reason は `pose_stale_for_roi`。
- [✓] Worker stats schema — `effectiveFaceRoiFps?: number` と `roi?: SincroTrackerRoiStats` が optional field として追加され、既存 effective fps 名は維持されている。
- [✓] `SincroTrackerRoiStats` 最小 schema — task 指定の pause state / counters / reason code enum を満たし、`startFaceTracking()` / `stopFaceTracking()` で reset される。
- [✓] performance budget reason codes — ROI reason code は budget report に流れ、`target` / `observed` shape は維持されている。ROI 詳細は `SincroTrackerWorkerStats.roi` に閉じている。
- [✓] main-thread fallback clamp — policy は Face `<=8fps`、Pose `<=4fps`、Hand ROI `<=2fps`、Face ROI `<=3fps`。
- [✓] ROI over-budget formula と 5/30 frame state machine — controller は `hand + faceRoi > 1000 / max(1, targetPoseInferenceFps) * 0.55`、5 frame advance、30 frame recovery を実装している。
- [✓] pause order / full-frame Face 継続 — pause state enum と skip logic は `active -> hand-paused -> face-paused -> all-paused` の順序を持ち、pause 中も camera / full-frame Face を止めない。
- [✓] pause 中 snapshot 更新 — Hand は `createSincroHandFallbackSnapshot()` で lost snapshot と fallback reason を出し、Face は full-frame snapshot に `face_roi_paused` warning / ROI metadata を付与する。
- [✓] motion-debug metrics 保存 / viewer 表示 — `frame.metrics.tracker` に ROI stats が入り、viewer metrics layer は replay frame の raw metrics JSON から `roi` stats を確認できる。
- [✓] テストカバレッジ — cadence / ROI budget / budget report / viewer に加え、attempt 2 で `trackerRuntime.test.ts` が追加され、fresh Pose により Face ROI が due の frame でも full-frame `detect()` と ROI `detectWithRoi()` が両方呼ばれ、公開 snapshot の `source` が full-frame のまま ROI metadata を持つことを検証している。
- [✓] docs 同期 — `documents/design/frontend/character/tracking.md`、`motion.md`、`overview.md` に Phase 8 cadence / fallback / reason / debug metrics が同期されている。

## テスト結果

- `npm run gate`（評価 worktree `/private/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-7be061ada529-yCk20a`、HEAD `7be061a`、clean）: passed
    - `gate:lint`: CACHE HIT / passed
    - `gate:build`: CACHE HIT / passed
    - `gate:test`: CACHE HIT / 280 passed
- カバレッジ評価: 受け入れ条件の主要リスクだった Face ROI による full-frame Face 置換は、実装レビューと runtime-level regression test の両方で解消を確認した。Worker 経路もコード上 `face` と `faceRoi` が分離されている。

## ドキュメント整合性

- 公開 WebRTC / backend 契約の変更はなし。
- developer-visible tracking runtime options、worker stats、degradation policy、debug metrics の変更はあり。
- 対応ドキュメントは `documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/overview.md` に同期済み。attempt 2 は文書化済みの「Face ROI は optional lower fps pass、full-frame Face cadence は維持」に実装を合わせる修正で、追加のドキュメント未同期はない。

## 残課題（FAIL の場合）

- なし。
