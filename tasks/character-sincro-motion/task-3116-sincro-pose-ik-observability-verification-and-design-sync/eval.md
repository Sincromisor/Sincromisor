# Evaluation

Note: screenshot PNG artifacts were used for local visual verification but are intentionally local-only and not committed, because they include the operator's room.

## Verdict

PASS

Current status: independent `impl-evaluator` returned `NEEDS_REVISION` on 2026-06-18, and the follow-up evidence resolved its actionable blockers. The implementation and camera / IK evidence are acceptable after the user explicitly accepted the observed MediaPipe off-frame inference behavior on 2026-06-19.

Residual risk:

- Full `npm run gate` still fails because of Markdown formatting warnings outside the task-local touched set: `requests.md` and `documents/research/character_animation/**`.
- Task-local formatting, task metadata checks, and whitespace checks pass.

## 2026-06-18 Evaluation

自動確認できる範囲では、build、`simple-vrm` / `motion-debug` の初期表示、desktop / mobile viewport、`motion-debug` debug API presence は通過した。

PASS にしない理由:

- `motion-debug` の `startCamera()` は Playwright camera permission 付与後も `Camera request timed out after 12000ms.` で失敗し、実カメラ pose detection と `waitForPoseDetected()` の成功確認ができなかった。
- 必須姿勢パターンである低 wrist confidence、片手上げ、横開き、肘曲げ、片腕欠損、両腕欠損、近距離上半身構図を実カメラで確認できていない。
- リポジトリ内に確認可能な VRM は `sincromisor-frontend/public/characters/default.vrm` の 1 体のみで、タスクが要求する 2 体以上の VRM 確認を満たしていない。
- 人間の目による破綻判定、特に腕の 180 度反転、肩の深いめり込み、継続的な wrist roll jitter、T pose 付近固定の有無を判断できていない。

確認済み:

- `cd sincromisor-frontend && npm run build`: PASS
- `simple-vrm` `1280x720`: PASS、横 overflow なし、screenshot 保存済み
- `simple-vrm` `390x844`: PASS、横 overflow なし、screenshot 保存済み
- `motion-debug` `1280x720`: PASS、横 overflow なし、console error / warning なし、screenshot 保存済み
- `motion-debug` `390x844`: PASS、横 overflow なし、screenshot 保存済み
- `window.__SINCRO_MOTION_DEBUG__`: required API presence PASS

結論:

本タスクは実機・複数 VRM・人間の視覚評価が acceptance の中核であり、今回の自動検証だけでは完了条件を満たさない。`status=open` のまま継続し、次回は実カメラが Playwright / browser に見える環境と 2 体目 VRM を用意して再評価する。

## 2026-06-18 Camera Retry Addendum

`aoi-1.0.7.vrm` 追加後に camera 起動を再評価した。

- `startCamera()`: PASS
- Camera stream: PASS (`source=camera`, `1280x720`, `readyState=4`)
- Tracker startup: PASS (`mode=worker`, `status=running`)
- `waitForPoseDetected(5000)`: FAIL (`Pose was not detected within 5000ms.`)
- Runtime fallback reason: `pose_lost`
- Available VRM files: `default.vrm`, `aoi-1.0.7.vrm`

評価更新:

- 前回の camera timeout blocker は解消した。
- ただし pose detection 成功、必須姿勢パターン、`aoi-1.0.7.vrm` を含む複数 VRM の visual / IK 確認は未完了。
- Verdict は `FAIL` のまま維持する。

## 2026-06-18 Pose Detection Addendum

カメラ構図調整後に `waitForPoseDetected(6000)` を最大 10 回試行し、1 回目で pose detection に成功した。

- `pose.detected`: PASS
- `pose.confidence`: 約 `0.9996`
- `poseRetargetRuntime.active`: PASS
- `poseRetargetRuntime.ikMode`: `world_3d_ik`
- 観測できた切り分け:
    - shoulders are strong
    - left elbow / wrist are not usable
    - right wrist is out of frame as 2D target but weak in world target
    - left arm falls back with `arm_not_tracked`
    - right arm activates `world_3d_ik`
    - right arm solver reports `joint_limited`

評価更新:

- camera permission、camera startup、pose detection、runtime snapshot による原因切り分けは PASS。
- ただし必須姿勢パターン全体、継続的な jitter / flip の人間評価、`aoi-1.0.7.vrm` を含む複数 VRM の visual / IK 確認は未完了。
- Verdict は `FAIL` のまま維持する。

## 2026-06-18 Both Hands Visible Addendum

腕と手が映る構図で `motion-debug` を再試行し、1 回目の `waitForPoseDetected(5000)` で両手首 target と両腕 IK activation を確認した。

- `pose.detected`: PASS
- `pose.confidence`: 約 `0.9999`
- left shoulder / elbow / wrist: `strong`
- right shoulder / elbow / wrist: `strong`
- left wrist / right wrist: `usableForIk=true`
- left arm / right arm: `ikActive=true`
- left arm / right arm `ikSolverMode`: `world_3d_ik`
- left arm / right arm `ikWeight`: `0.9`
- solver constraint: both arms `joint_limited`

評価更新:

- 「両腕が見えている」baseline と、両腕 `world_3d_ik` の runtime observability は PASS。
- 静止 screenshot では明確な 180 度反転や T pose 固定は見えない。
- ただし、姿勢パターン全体、時間方向の jitter / flip 判定、複数 VRM visual 確認はまだ未完了。
- Verdict は `FAIL` のまま維持する。

## 2026-06-18 Pose Pattern Matrix Addendum

ユーザー実演により、必須姿勢パターンを `motion-debug` で一括確認した。

- Baseline both hands visible: PASS
- Low wrist confidence: PASS
- One hand raised: PASS
- Arms spread: PASS
- Elbow bend: PASS
- One arm missing: ACCEPTED_WITH_MEDIAPIPE_INFERENCE
    - 初回 matrix では完全な単腕 `lost` は再現できず、片腕 `weak / low_confidence` として観測した。
    - 後続の external Chrome retry では、ユーザー目視で片側が画面外になり、同側 wrist が `lost / out_of_frame`、`usableForIk=false` になったため、MediaPipe off-frame inference behavior として受け入れた。
- Both arms missing: PASS
- Close upper body: PASS

評価更新:

- カメラ、pose detection、target quality、IK gate、solver constraint の観測経路は PASS。
- 姿勢パターン matrix は PASS。single-arm missing は MediaPipe が elbow を推定保持する挙動として受け入れ済み。
- 静止 screenshot / snapshot では、明確な arm flip、T pose 固定、深い shoulder penetration は確認されない。
- full `npm run gate` は task 外 Markdown formatting warnings で未通過だが、task-local checks は PASS。

## 2026-06-18 Aoi VRM Addendum

`motion-debug` に `?vrm=/characters/aoi-1.0.7.vrm` を指定し、追加 VRM で camera / tracker / retarget / render 経路を再確認した。

- `aoi-1.0.7.vrm` visual load: PASS
- `startCamera()`: PASS
- `waitForPoseDetected(5000)`: PASS on attempt 1
- initial left / right arm IK: PASS (`world_3d_ik`, `ikActive=true`)
- 12 秒 stability sample:
    - 24 / 24 samples で pose detected
    - 24 / 24 samples で runtime active
    - 24 / 24 samples で左右 IK active
    - 左右 wrist quality は全 sample `strong`
    - render FPS は約 60

評価更新:

- 複数 VRM 確認は `default.vrm` と `aoi-1.0.7.vrm` の 2 体で PASS。
- 時間方向の短時間観察では、明確な arm flip、T pose 固定、継続的な wrist roll jitter、深い shoulder penetration は見えない。
- 後続の独立 `impl-evaluator` review と single-arm missing の扱い判断は実施済み。

## 2026-06-18 Aoi Public Route Addendum

独立 `impl-evaluator` 指摘を受け、Vite source URL ではなく公開 alias の `/motion-debug/?vrm=/characters/aoi-1.0.7.vrm` で再確認した。

- `motionDebugVrmStage.dataset.ready`: PASS
- `window.__SINCRO_MOTION_DEBUG__` API presence: PASS
- `startCamera()`: PASS
- `waitForPoseDetected(5000)`: PASS on attempt 1
- pose confidence: `0.9999481439590454`
- left / right wrist quality: `strong`
- runtime: active, `world_3d_ik`
- left / right arm IK: active

評価更新:

- `aoi-1.0.7.vrm` は公開 `/motion-debug/` route alias でも確認済み。
- single-arm missing PARTIAL の受け入れ判断は、後続の external Chrome retry とユーザー判断で解消済み。
- Full `npm run gate` は task-local `review.md` 整形後も、task 外の Markdown formatting warning により未通過。

## 2026-06-18 External Chrome Addendum

in-app Browser では camera permission が通らなかったため、外部 Chrome + Codex extension で再確認した。

- external Chrome camera startup: PASS
- page main world debug API access through CDP: PASS
- baseline pose / both wrist strong: PASS
- runtime `world_3d_ik`: PASS
- single-arm missing retry: ACCEPTED_WITH_MEDIAPIPE_INFERENCE
    - one wrist reached `lost / out_of_frame` while the opposite wrist stayed `strong`
    - the same-side elbow stayed `strong`, consistent with MediaPipe retaining an inferred off-frame elbow target

評価更新:

- 外部 Chrome 経由なら、ユーザーが画面を見ながら姿勢を調整し、Codex が snapshot を読む運用が可能。
- single-arm missing は、ユーザー目視と wrist `lost / out_of_frame` evidence を合わせて accepted とする。

## 2026-06-19 Single-Arm Missing Acceptance Decision

ユーザーの目視では、外部 Chrome の camera pane 上で左半身は完全に画面外へ出ていた。一方、MediaPipe は同側 elbow を `strong` として保持し、wrist のみ `lost / out_of_frame`、`usableForIk=false` として返した。

判断:

- この挙動は、画面外でも近傍の pose として elbow を推定保持する MediaPipe 側の仕様 / 挙動として扱う。
- single-arm missing の acceptance は「完全な elbow + wrist lost」ではなく、ユーザー目視で片腕が画面外、かつ runtime 上で wrist が `lost / out_of_frame`、`usableForIk=false`、反対腕が `strong` を維持する状態を sufficient として採用する。
- 本タスクの目的は、片腕が画面外になった時に IK が暴れず、target quality / staleReason / IK weight を観測できることの確認であるため、今回の external Chrome evidence を accepted とする。

評価更新:

- single-arm missing: ACCEPTED_WITH_MEDIAPIPE_INFERENCE
- ユーザー側の追加対応は不要。
- 残る blocker は full `npm run gate` の task 外 Markdown formatting warnings のみ。
