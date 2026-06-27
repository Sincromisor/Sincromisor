# Evaluation: task-260627180726-character-animation-3-0-phase-9-finger-curl-pose-mapping

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] 依存 semantic layer kind の存在確認 — `VrmPoseLayerKind` に `"semantic"` が存在し、`semanticMotionPoseLayer.ts` / composer semantic tests も HEAD に存在する。
- [✓] `fingerCurlPoseLayer.ts` の追加と指定 export — `createFingerCurlPoseLayer()`、`createFingerCurlPoseLayers()`、`FingerCurlPoseLayerInput`、`FingerCurlGroupState`、`FingerCurlPoseDebugSnapshot`、`FingerCurlPoseLayerResult` が export されている。
- [✓] side 単位 helper と left/right convenience helper — `createFingerCurlPoseLayer()` が正本実装で、`createFingerCurlPoseLayers()` は left / right を順に呼び、存在する layer と debug をまとめる。
- [✓] input / return shape と `mediaTimeMs` 基準 — task.md 指定の shape と一致し、previous hold は `previous.timestamp.mediaTimeMs` と caller 指定 `mediaTimeMs` の差分で判定している。`lastUpdatedAtMs` は読んでいない。
- [✓] 入力境界 — helper は `SincroHandMotionSnapshot` / `MotionIntentState` / `AvatarMotionProfile` / `mediaTimeMs` / optional previous debug のみを読み、raw landmarks、MediaPipe raw result、VRM Object3D、raw bone node は参照していない。
- [✓] finger group 固定 — `thumb`、`index`、`middle`、`ringLittle` に固定され、ring / little は同じ group curl を使う。
- [✓] openness fallback / previous hold — `open=0`、`half=0.55`、`closed=1`、`unknown` では side 一致かつ `0..250ms` の previous のみ保持し、side mismatch / negative dt / stale previous は default `0` になる。
- [✓] intent override — `pointing`、`thumbsUp`、`peace`、`wave`、`explain` の制約が実装され、`tracking` は Hand snapshot curl を優先する。
- [✓] `curlScale` / clamp / `curlMode` — group curl に profile `curlScale` を適用して `0..1` に clamp し、`grouped` / `perFinger` によらず group input のみを使う。
- [✓] distribution invalid default — `proximal + intermediate + distal` が `1.0 ± 0.001` から外れる場合、default `{ proximal: 0.5, intermediate: 0.3, distal: 0.2 }` に戻し `invalid_finger_curl_distribution_profile_defaulted` を残す。
- [✓] optional finger chain fallback — `AvatarMotionProfile.capabilities.fingerChains` を正本に存在 bone だけを owned/pose に出し、存在 bone weight を正規化する。proximal only は `0.65x` angle limit、group 全欠損は `missing_finger_chain:<side>:<group>` warning で throw しない。
- [✓] layer contract / ownership — `kind: "semantic"`、`blendMode: "additive"`、`id: "finger-curl:<side>"` で、ownedBones は finger bones のみ。全 chain 欠損時は optional `layer` を返さず debug のみ返す。
- [✓] angle / axis / sign — curl max `70deg`、thumb oppose max `22deg`、splay max は `profile.fingers.splayLimitDeg`。curl は local `+X` に `-angle`、splay は local `+Z` に left `+` / right `-`、thumb oppose は local `+Y` に left `+` / right `-`。
- [✓] quaternion 合成 / plain object — 実装は `final = oppose * splay * curl` の順で合成し、thumb oppose は thumb group の最初に存在する chain bone のみに入れる。layer / debug snapshot に `THREE.Quaternion` instance は残らない。
- [✓] unit test — `fingerCurlPoseLayer.test.ts` が openness fallback、intent override、curlScale、invalid distribution default、missing distal redistribution、missing whole group warning、finger-only ownership / plain quaternion を検証している。
- [✓] docs 同期 — `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に finger group、curl distribution、optional bone fallback、axis / sign、raw landmark rotation を扱わない方針が同期されている。

## テスト結果

- `npm run gate`（cwd: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-038b7d6c267c-LLwy7S`）: PASS。
    - `gate:lint` CACHE HIT recorded `2026-06-27T13:33:18.949Z` @ `038b7d6` clean。
    - `gate:build` CACHE HIT recorded `2026-06-27T13:33:23.945Z` @ `038b7d6` clean。
    - `gate:test` CACHE HIT recorded `2026-06-27T13:33:26.697Z` @ `038b7d6` clean、`324 passed (324)`。
- `cd sincromisor-frontend && npm run test -- fingerCurlPoseLayer`: PASS、`1 passed` file / `7 passed` tests。
- カバレッジ評価: task.md の必須観点は実装者テストと静的確認で十分に覆われている。特に previous side mismatch、available bone redistribution、全 chain 欠損時の optional layer なし、finger-only ownership はテストで直接確認されている。実 VRM モデルでの視覚確認は本タスクの本番接続スコープ外であり、残リスクとしては限定的。

## ドキュメント整合性

- 公開 WebRTC / backend 契約の変更はなし。
- developer-visible な motion contract / AvatarMotionProfile finger fallback の公開挙動追加あり。
- 同一 commit で `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` が同期済み。同期内容は入力境界、finger group、curl distribution、optional chain fallback、axis / sign、plain quaternion / raw landmark rotation 不使用方針を含む。

## 残課題（FAIL の場合）

- なし。
