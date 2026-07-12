# Implementation Log

Note: screenshot PNG artifacts were used for local visual verification but are intentionally local-only and not committed, because they include the operator's room.

## 2026-06-18 タスク整理

- 本タスクを roadmap Phase 0 の完了 gate として整理した。
- 実装対象候補の旧 `documents/tasks/...` 参照を、現行の `tasks/character-sincro-motion/...` 参照へ更新した。
- 本タスクでは現行 face / pose / IK / debug 基盤の実機確認、既知限界、後続課題の記録に集中し、Phase A 以降の評価基盤や中間 contract 新設を持ち込まない方針を明記した。
- review の NEEDS_REVISION を受け、検証条件、VRM 最小数、viewport / URL、OK / NG 条件、保存先、`motion-debug` window API の確認手順を task.md に追記した。
- 実装対象候補を、手編集候補と参照・生成・確認対象に分けた。

確認:

- `npm run tasks:index`
- `npm run tasks:index:check`
- `npm run tasks:check`

残リスク:

- 実カメラ、複数 VRM、`motion-debug` camera permission 付き検証は未実施。
- 検証結果によっては、現行基盤内の軽微調整または roadmap Phase A 以降の新規タスク化が必要になる。

## 2026-06-18 自動検証

実施内容:

- `cd sincromisor-frontend && npm run build` を実行し、TypeScript compile と Vite build が成功した。
- Vite dev server を `http://127.0.0.1:5173/` で起動し、Playwright / Chromium で `simple-vrm` と `motion-debug` を確認した。
- `simple-vrm` は `1280x720` と `390x844` でスクリーンショットを保存し、どちらも document-level の横 overflow はなかった。
- `simple-vrm` は VRM 読み込みまで到達した。backend 未起動のため `/api/v1/RTCSignalingServer/config.json` は 404 だったが、今回の pose / IK UI 検証とは別の環境由来として扱う。
- `motion-debug` は `1280x720` と `390x844` でスクリーンショットを保存し、どちらも document-level の横 overflow はなかった。
- `motion-debug` desktop 初期表示では console error / warning は 0 件だった。
- `window.__SINCRO_MOTION_DEBUG__` に `startCamera`、`stopCamera`、`setRetargetConfig`、`getSnapshot`、`captureFrame`、`waitForPoseDetected`、`loadVideoFixture` が存在することを確認した。
- Playwright context に camera permission を付与したうえで `startCamera()` を呼んだが、`Camera request timed out after 12000ms.` で失敗した。ホスト実カメラ stream が Playwright session に提供されなかったため、`waitForPoseDetected()` の成功確認は未実施。
- リポジトリ内の VRM は `sincromisor-frontend/public/characters/default.vrm` の 1 体のみだったため、2 体以上の VRM 確認は未実施。

保存 artifact:

- private screenshots: `simple-vrm-desktop-1280x720.png`, `simple-vrm-mobile-390x844.png`
- private screenshots: `motion-debug-desktop-1280x720.png`, `motion-debug-mobile-390x844.png`
- `artifacts/playwright-verification-summary-2026-06-18.json`
- `acceptance/verification-2026-06-18.md`

採用判断:

- 今回の実行では IK 既定値を変更しない。
- 現行採用値は `armIkMode=world_3d_ik`、`armIkStrength=1.0`、`armIkTargetScale=1.0`、`smoothingMs=155`、`minConfidence=0.45`、`returnToNeutralMs=520` とする。
- 設計文書 `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` は現行実装の責務境界、target quality、IK gate、`motion-debug` API をすでに説明しており、今回の自動検証から追加仕様差分は出ていない。

未実施 / 残リスク:

- 実カメラでの低 wrist confidence、片手上げ、横開き、肘曲げ、片腕欠損、両腕欠損、近距離上半身構図は未確認。
- 複数 VRM での腕長・初期姿勢・optional bone 差分確認は未確認。
- 人間の目による、腕の 180 度反転、肩の深いめり込み、継続的な wrist roll jitter、T pose 付近固定の有無は未確認。
- 上記は task の PASS 条件なので、本実行ではタスクを完了扱いにしない。

## 2026-06-18 カメラ再試行

ユーザーが `sincromisor-frontend/public/characters/aoi-1.0.7.vrm` を追加した後、`motion-debug` の camera 起動を再試行した。

結果:

- `aoi-1.0.7.vrm` の存在を確認し、確認可能な VRM asset は `default.vrm` と `aoi-1.0.7.vrm` の 2 体になった。
- Playwright / Chromium で `http://127.0.0.1:5173/motion-debug/` を開き、camera permission を付与した。
- `window.__SINCRO_MOTION_DEBUG__.startCamera()` は成功した。
    - `camera.source`: `camera`
    - `camera.width`: `1280`
    - `camera.height`: `720`
    - `camera.readyState`: `4`
- Tracker は `mode=worker`、`status=running` まで到達した。
- `waitForPoseDetected(5000)` は `Pose was not detected within 5000ms.` で失敗した。
- snapshot 上の retarget fallback は `pose_lost`。
- 画面上でも camera frame は表示されたが、確認時の構図では PoseLandmarker が body pose を検出しなかった。

保存 artifact:

- private screenshot: `motion-debug-camera-running-2026-06-18.png`
- `artifacts/camera-retry-summary-2026-06-18.json`

残り:

- 前回の `Camera request timed out after 12000ms.` blocker は解消した。
- ただし、実カメラ姿勢パターンの acceptance は未完了。次回は肩、肘、手首が十分に映る距離・構図で `waitForPoseDetected()` を再試行する。
- `motion-debug` は現状 `/characters/default.vrm` 固定で起動するため、`aoi-1.0.7.vrm` の visual / IK 確認は別途 `simple-vrm` の VRM 選択経路、または `motion-debug` 側の VRM URL 切替手段を使って行う必要がある。

## 2026-06-18 Pose 検出再試行

ユーザーがカメラ前に映り込むよう構図を調整した状態で、`motion-debug` の pose detection を再試行した。`waitForPoseDetected(6000)` を最大 10 回試すループを走らせ、1 回目で検出に成功した。

結果:

- `pose.detected`: `true`
- `pose.confidence`: 約 `0.9996`
- `tracker.mode`: `worker`
- `tracker.status`: `running`
- `poseRetargetRuntime.active`: `true`
- `poseRetargetRuntime.ikMode`: `world_3d_ik`
- `anchor.reason`: `hips_fallback_to_shoulders`
- 左腕:
    - shoulder は `strong`
    - elbow は `low_confidence`
    - wrist は `out_of_frame`
    - retarget runtime は `arm_not_tracked`
- 右腕:
    - shoulder / elbow は `strong`
    - wrist は 2D target としては `out_of_frame` だが world target は weak
    - `ikActive=true`
    - `ikSolverMode=world_3d_ik`
    - `ikWeight` は約 `0.2481`
    - solver fallback / constraint は `joint_limited`

保存 artifact:

- private screenshot: `motion-debug-pose-detected-2026-06-18.png`
- `artifacts/pose-detected-summary-2026-06-18.json`

判断:

- camera startup と基本 pose observability path は確認できた。
- Debug snapshot から、肩検出、手首 out-of-frame、片腕 fallback、片腕 IK active、solver-side joint limit を切り分けられることを確認した。
- ただし、必須姿勢パターン全体と `aoi-1.0.7.vrm` を含む複数 VRM の visual / IK 確認は未完了のため、タスク全体の FAIL 判定はまだ維持する。

## 2026-06-18 両腕・両手表示構図

ユーザーが腕と手も映るように構図を調整した状態で、`motion-debug` を再試行した。`waitForPoseDetected(5000)` を最大 12 回試すループを走らせ、1 回目で両手首 target まで usable な snapshot を取得できた。

結果:

- `pose.detected`: `true`
- `pose.confidence`: 約 `0.9999`
- 左腕:
    - shoulder / elbow / wrist はすべて `strong`
    - wrist は `usableForIk=true`
    - world wrist target は `worldQuality=strong` / `worldUsableForIk=true`
    - retarget runtime は `ikActive=true` / `ikSolverMode=world_3d_ik`
    - `ikWeight` は `0.9`
    - solver constraint は `joint_limited`
- 右腕:
    - shoulder / elbow / wrist はすべて `strong`
    - wrist は `usableForIk=true`
    - world wrist target は `worldQuality=strong` / `worldUsableForIk=true`
    - retarget runtime は `ikActive=true` / `ikSolverMode=world_3d_ik`
    - `ikWeight` は `0.9`
    - solver constraint は `joint_limited`

保存 artifact:

- private screenshot: `motion-debug-both-hands-detected-2026-06-18.png`
- `artifacts/both-hands-detected-summary-2026-06-18.json`

判断:

- 「両腕が見えている」baseline では、両手首 target と両腕 `world_3d_ik` activation を確認できた。
- screenshot の静止確認では、両手 overlay と VRM 側の両手姿勢に明確な 180 度反転や T pose 固定は見えなかった。
- 継続的な jitter、姿勢パターン一式、`aoi-1.0.7.vrm` での visual / IK 確認はまだ未完了。

## 2026-06-18 姿勢パターン一括確認

ユーザーの実演に合わせて、`motion-debug` で必須姿勢パターンを順に確認した。各パターンで snapshot summary と screenshot を保存した。

結果:

- 両手 baseline:
    - 左右 shoulder / elbow / wrist はすべて `strong`
    - 両腕 `world_3d_ik`
    - 両腕 `ikWeight=0.9`
    - 両腕 `joint_limited`
- 低 wrist confidence:
    - 左 wrist が `weak / low_confidence`
    - 左 wrist は `usableForIk=true`
    - 左 `ikWeight=0.6597`
    - 低 confidence でも IK が弱く継続することを確認した。
- 片手上げ:
    - 上げた手は camera frame の上端付近で world target は `strong`
    - runtime は `ik_target_clamped`
    - 反対腕は `joint_limited`
- 横開き:
    - 両 wrist は `strong`
    - 両腕 `world_3d_ik`
    - 両腕 `joint_limited`
- 肘曲げ:
    - 両 wrist は `strong`
    - 両腕 `world_3d_ik`
    - `joint_limited`、`forearm_twist_limited`、`chest_no_go_zone` を観測した。
- 片腕欠損:
    - 完全な単腕 `lost` は再現できなかった。
    - 片腕の elbow / wrist が `weak / low_confidence` になり、IK weight が `0.4267` へ下がるケースとして保存した。
- 両腕欠損:
    - 左 elbow / wrist は `lost / out_of_frame`
    - 右 wrist は `lost / out_of_frame`
    - low weight の `world_3d_ik` は残った。
- 近距離上半身:
    - shoulder は `strong`
    - elbow / wrist は `lost / out_of_frame`
    - runtime は `feature_only`
    - fallback は `world_ik_elbow_low_confidence`

保存 artifact:

- private screenshots: `pattern-baseline-both-hands-2026-06-18.png`, `pattern-low-wrist-confidence-2026-06-18.png`
- private screenshots: `pattern-one-hand-raised-2026-06-18.png`, `pattern-arms-spread-2026-06-18.png`
- private screenshots: `pattern-elbow-bend-2026-06-18.png`, `pattern-one-arm-weak-target-2026-06-18.png`
- private screenshots: `pattern-both-arms-missing-2026-06-18.png`, `pattern-close-upper-body-2026-06-18.png`
- `artifacts/pose-pattern-matrix-summary-2026-06-18.json`

判断:

- 必須姿勢パターンは一通り確認した。
- 片腕欠損はこの時点では完全 lost ではなく weak target として観測されたため、PARTIAL とした。
- 後続の external Chrome retry とユーザー判断により、MediaPipe off-frame inference behavior として acceptance 上は accepted に更新した。
- 静止 screenshot と snapshot 上では、明確な 180 度反転、T pose 固定、深い shoulder penetration は見えない。
- 時間方向の jitter / flip 観察と、`aoi-1.0.7.vrm` を含む複数 VRM 確認は未完了。

## 2026-06-18 `aoi-1.0.7.vrm` motion-debug 確認

`motion-debug` は `DEFAULT_VRM_URL` 固定だったため、debug page の VRM だけを URL query で差し替えられるようにした。

- 追加した指定:
    - `/motion-debug/?vrm=/characters/aoi-1.0.7.vrm`
- safety:
    - cross-origin URL は拒否して `/characters/default.vrm` に戻す。
    - `/characters/` 配下以外の URL は拒否して `/characters/default.vrm` に戻す。
- design sync:
    - `documents/design/frontend/pages.md`
    - `documents/design/frontend/character/motion.md`

確認結果:

- `aoi-1.0.7.vrm` は motion-debug の VRM pane に表示された。
- `startCamera()`: PASS
- `waitForPoseDetected(5000)`: PASS on attempt 1
- 初回 snapshot:
    - `pose.detected=true`
    - `pose.confidence=0.9999240040779114`
    - 左右腕 `ikActive=true`
    - 左右腕 `ikSolverMode=world_3d_ik`
    - 左右腕 `ikWeight=0.38358490363994435`
    - 左右腕 `fallbackReason=joint_limited`
- 12 秒 stability sample:
    - 24 / 24 samples で `pose.detected=true`
    - 24 / 24 samples で runtime active
    - 24 / 24 samples で左右 IK active
    - 左右 wrist quality は全 sample `strong`
    - 左 `ikWeight` range: `0.7343545726328579` - `0.9301799403288689`
    - 右 `ikWeight` range: `0.7039634804605239` - `0.9772740293769653`
    - render FPS range: `59.37067089068203` - `60.67723624904744`

保存 artifact:

- private screenshot: `motion-debug-aoi-detected-2026-06-18.png`
- `artifacts/aoi-vrm-motion-debug-summary-2026-06-18.json`

判断:

- `default.vrm` に加えて `aoi-1.0.7.vrm` でも同じ camera / tracker / `world_3d_ik` 経路を確認できた。
- screenshot と live sampling window では、明確な arm flip、T pose 固定、継続的な wrist roll jitter、深い shoulder penetration は見えなかった。

## 2026-06-18 `aoi-1.0.7.vrm` public route 再確認

独立 `impl-evaluator` から、artifact の URL が Vite source path の `/pages/motionDebug/` だったため、公開 alias の `/motion-debug/` でも再確認するよう指摘があった。

結果:

- URL: `/motion-debug/?vrm=/characters/aoi-1.0.7.vrm`
- `motionDebugVrmStage.dataset.ready`: `true`
- `window.__SINCRO_MOTION_DEBUG__` API presence: PASS
- `startCamera()`: PASS
- `waitForPoseDetected(5000)`: PASS on attempt 1
- `pose.confidence`: `0.9999481439590454`
- 左右 wrist quality: `strong`
- runtime: `active=true`, `ikMode=world_3d_ik`
- 左右腕: `ikActive=true`, `ikSolverMode=world_3d_ik`

保存 artifact:

- private screenshot: `motion-debug-aoi-public-route-detected-2026-06-18.png`
- `artifacts/aoi-vrm-public-route-summary-2026-06-18.json`

判断:

- public route alias でも `aoi-1.0.7.vrm` の motion-debug camera / IK 経路は確認できた。

## 2026-06-18 外部 Chrome + Codex extension 確認

in-app Browser では `getUserMedia` が `Permission denied` になりカメラ確認を継続できなかったため、外部 Chrome に Codex extension を導入し、拡張経由で motion-debug を確認した。

結果:

- 外部 Chrome の制御可能タブを作成できた。
- URL: `/motion-debug/?vrm=/characters/aoi-1.0.7.vrm`
- `Start` 後に camera stream が起動した。
    - `source=camera`
    - `width=1280`
    - `height=720`
    - `readyState=4`
- CDP の page main world 経由で `window.__SINCRO_MOTION_DEBUG__.getSnapshot()` を読めた。
- baseline:
    - `pose.detected=true`
    - `pose.confidence=0.9976635277271272`
    - 左右 shoulder / elbow / wrist はすべて `strong`
    - runtime は `active=true`
    - `ikMode=world_3d_ik`
- single-arm missing retry:
    - 左 wrist は `lost / out_of_frame`
    - 左 wrist は `usableForIk=false`
    - 右 wrist は `strong`
    - 左 elbow は `strong` のままだった。ユーザー目視では左半身が画面外だったため、MediaPipe が elbow を推定保持した off-frame inference behavior として扱う。
    - その後、両腕同時 lost の sample は取れたが、`pose.detected=false` だったため single-arm missing の acceptance には使わない。

保存 artifact:

- `artifacts/external-chrome-camera-summary-2026-06-18.json`

## 2026-06-19 片腕欠損 PARTIAL の受け入れ判断

ユーザーの目視では、外部 Chrome の camera pane 上で左半身は完全に画面外へ出ていた。一方、MediaPipe は左 elbow を `strong` として保持し、左 wrist のみ `lost / out_of_frame`、`usableForIk=false` として返した。

判断:

- 画面外でも elbow を近傍 pose として推定保持する MediaPipe 側の仕様 / 挙動として扱う。
- single-arm missing は、完全な elbow + wrist lost ではなく、ユーザー目視で片腕が画面外、かつ runtime 上で wrist が `lost / out_of_frame`、`usableForIk=false`、反対腕が `strong` を維持する状態を sufficient として採用する。
- 本タスクの目的は、片腕が画面外になった時に IK が暴れず、target quality / staleReason / IK weight を観測できることの確認であるため、この evidence を acceptance 上 accepted とする。

後続候補:

- MediaPipe quality だけに依存せず、camera frame boundary / staleReason / wrist usability を組み合わせた off-frame 判定を後続タスクで検討する。
