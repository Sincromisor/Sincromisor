# character animation 3.0 phase 12 motion intent estimator split

## 背景 / 目的

`sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts` は 1111 行あり、config normalize、gesture gate、near-face / clap / guarded / wave 判定、side memory state machine、public factory が 1 ファイルに同居している。`documents/rules/code-structure.md:17` の hard threshold を超え、意図推定の理由を読み解くにはファイル全体を追う必要がある。

このタスクでは `MotionIntentEstimator` の公開 API と出力 contract を維持しつつ、候補検出・状態遷移・config 正規化を module 分割し、意図推定の非自明な判断にコメントを追加する。

依存:

- `task-260628200308-character-animation-3-0-phase-12-code-structure-guard`

## 完了条件（受け入れ条件）

- [ ] 既存 import 互換のため、`motionIntentEstimator.ts` は facade / public class の入口として残し、`MotionIntentEstimator`、`createMotionIntentState()`、既存 export type を維持する。
- [ ] `motionIntentEstimator.ts` から次の module へ責務を分割する。
    - `motionIntentEstimatorTypes.ts`: estimator input/config、side memory、candidate、context の内部型。公開型は既存 import 互換のため facade から re-export する。
    - `motionIntentEstimatorConfig.ts`: `DEFAULT_CONFIG`、timing / threshold normalize、clamp helper。
    - `motionIntentSideState.ts`: tracking / lost / fallback / intent state builder と warning dedupe。
    - `motionIntentCandidateDetectors.ts`: gesture、nearFace、wave、motion fallback の candidate 生成。
    - `motionIntentGlobalDetectors.ts`: clap-like、guarded、side-swap suspect など左右横断判定。
    - `motionIntentSideMachine.ts`: side memory 更新、cooldown、semantic hold、candidate stabilization。
- [ ] 各新規 production module は原則 300 行以下にする。超える場合は同じ行に `// reason: structure-threshold-exception <理由>` を付ける。
- [ ] `MotionIntentEstimator.update()` の戻り値、warning code、cooldown、stableDurationMs、semantic hold、wave 判定の既存挙動を変えない。
- [ ] `MOTION_INTENT_SCHEMA_VERSION` と `parseMotionIntentState()` の contract は変更しない。
- [ ] estimator public class に TSDoc または直前コメントで「入力境界は temporal / reliability / hand / optional gesture であり、VRM bone や MediaPipe raw result を読まない」ことを書く。
- [ ] gesture confidence、hand reliability、side swap hold、wave alternation のような非自明な gate には日本語コメントで理由を残す。
- [ ] テスト都合だけで internal helper を export しない。helper を直接検証する必要がある場合は責務 module の public-but-domain-internal な関数として命名し、facade からは re-export しない。
- [ ] `documents/design/frontend/character/motion.md` の `src/character/motionIntent` 責務説明に、分割後の module 境界を同期する。

## 設計判断（着手前に確定済み）

- public class は残す。`MotionDebugApp` など既存 call site が `new MotionIntentEstimator()` に依存しているため、外部 API を変えず内部だけ薄くする。
- detector と side state machine を分ける。候補生成と hysteresis / cooldown を同じ関数に置くと、誤判定修正時に「観測判定」と「状態維持」のどちらを変えたか分からなくなるため。
- config normalize は独立 module にする。default timing / threshold の根拠を読みやすくし、後続 profile 化の余地を持たせるため。
- gesture label mapping は candidate detector module に置く。`motionIntentState` は保存 contract であり、Gesture Recognizer raw label の処理を混ぜない。
- 外部境界は input object の optional `hand` / `gesture` / `reliability` だけである。network、LLM、DB、外部 telemetry は使わない。欠損入力は現状と同じ fallback / tracking / lost に落とす。

## スコープ境界

- 本タスクでやること:
    - `motionIntentEstimator.ts` の責務別分割。
    - public API と保存 contract の維持。
    - 意図推定 gate のコメント整備。
    - design doc 同期。
- 本タスクでやらないこと:
    - 新しい intent の追加。
    - threshold / timing の調整。
    - Gesture Recognizer runtime の追加。
    - VRM semantic pose の変更。
    - motion metrics の変更。
- 依存タスクとの境界:
    - code structure guard は悪化防止を提供する。本タスクは estimator 内部の分割だけを扱い、guard script は変更しない。

## 実装方針（既存コード整合: file:line）

- estimator input/config 型は `motionIntentEstimator.ts:15` から定義されている。分割後も facade から re-export する。
- default timing と threshold は `motionIntentEstimator.ts:141` と `motionIntentEstimator.ts:152` にある。値を変えず config module へ移す。
- gesture mapping は `motionIntentEstimator.ts:178` にある。candidate detector module へ移す。
- gesture gate は `motionIntentEstimator.ts:505`、global clap / guarded 判定は `motionIntentEstimator.ts:554` と `motionIntentEstimator.ts:574`、wave sample 更新は `motionIntentEstimator.ts:598` にある。これらを detector module 群へ分ける。
- public class は `motionIntentEstimator.ts:785` にある。constructor / update API は維持し、内部処理を side machine module に委譲する。
- public factory `createMotionIntentState()` は `motionIntentEstimator.ts:1106` にある。既存 export を維持する。
- `documents/design/frontend/character/motion.md:40` は `src/character/motionIntent` の保存 contract を説明している。module 境界はこの責務説明へ追記する。

## テスト

- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`
- `cd sincromisor-frontend && npm run test -- semanticMotionPoseLayer`
- `cd sincromisor-frontend && npm run test -- fingerCurlPoseLayer`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check:frontend-structure`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、`MotionIntentState` は replay / motion-debug で保存される developer-visible contract であり、意図推定 module 境界を `documents/design/frontend/character/motion.md` に同期する。
