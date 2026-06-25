# character animation 3.0 phase 5 temporal state estimator filters

## 背景 / 目的

Phase 5 の最初の実装段階として、`CanonicalUpperBodyState` と `ReliabilityMap` から `TemporalUpperBodyState` を生成する estimator を追加する。ここでは observed 値がある frame の state transition、One Euro Filter、classification hysteresis までを扱い、dropout 中の constant-velocity prediction と recovering blend は後続タスクに分ける。

この分割により、手が見えている通常 frame の jitter 低減と low confidence 時の `suspect` 表現を先に検証できる。

依存:

- `task-260625194536-character-animation-3-phase-5-temporal-state-contract`
- `task-260625035438-character-animation-3-phase-4-downstream-weights`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/temporal/oneEuroFilter.ts` を追加し、scalar 用 `OneEuroFilter1D` と設定型 `OneEuroFilterConfig` を export する。既存 gaze 用 filter は `features/gaze/characterGaze` 所有のため import せず、Phase 5 用に character/temporal 配下へ deterministic な実装を置く。
- [ ] `sincromisor-frontend/src/character/temporal/temporalStateEstimator.ts` を追加し、`TemporalStateEstimator`、`TemporalStateEstimatorConfig`、`TemporalStateEstimatorInput`、`createDefaultTemporalStateEstimatorConfig()` を export する。
- [ ] `TemporalStateEstimator.update(input)` は `canonical: CanonicalUpperBodyState`、optional `reliability?: ReliabilityMap`、`mediaTimeMs` を入力し、`TemporalUpperBodyState` を返す。`mediaTimeMs` は caller 入力を正本とし、estimator 内で `performance.now()` を呼ばない。
- [ ] state transition は腕ごとに `confidence >= 0.65 && reliability part/joint が tracked` を `"tracked"`、`0.05 <= confidence < 0.65` または reliability が `suspect` を `"suspect"`、`confidence < 0.05` または reliability が `lost` を `"lost"` に固定する。本タスクでは `"predicted"` / `"recovering"` を生成せず、後続タスク用に state enum と previous state を保持する。
- [ ] reliability 集約は arm part と shoulder / elbow / wrist joint の最悪 state を使う。優先順位は `lost > predicted > recovering > suspect > tracked` とし、本タスクでは入力 reliability の `predicted` / `recovering` は observed estimator の出力 state としては `"suspect"` に downcast する。1 joint でも `lost` なら arm state は `"lost"`、part または 1 joint でも `suspect` / `predicted` / `recovering` なら `"suspect"`、part と全 joint が `tracked` のときだけ `"tracked"` とする。
- [ ] wrist tuple、`reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad` に One Euro Filter を適用する。初期値は腕用として `minCutoff: 1.8`、`beta: 0.45`、`dCutoff: 1.0` に固定し、config override 可能にする。
- [ ] `TemporalPartMeta` は次の規則で埋める。`confidence` は filter 入力に使った canonical arm confidence、`source` は tracked / suspect なら `"canonical"`、lost なら `"neutral"`、`stateAgeMs` は state が前回と同じなら前回値 + dt、変わったら 0、`observedAgeMs` は tracked / suspect frame では 0、lost frame では前回 observedAgeMs + dt、warnings は low confidence で `low_confidence`、lost で `dropout`、classification hold で `classification_held`、invalid dt で `out_of_range` を重複なしで入れる。
- [ ] `classification` は候補分類が `confidence >= 0.35` で 160ms 以上連続して同じ値だった場合だけ更新する。160ms 未満、または confidence < 0.35 の間は前回 classification を維持し、値を維持した frame には `classification_held` warning を付ける。
- [ ] `TemporalArmState.velocity` は filter 後の値の差分から計算する。`dtMs <= 0`、`dtMs > 250`、非 finite dt の場合は filter 内部状態を更新せず前回 filtered 値を維持し、velocity を 0 にして warnings に `out_of_range` を追加する。lost frame は canonical の低信頼値を filter に投入せず、前回 filtered 値を維持して state/meta だけ更新する。
- [ ] `reset()` は previous temporal state、filter 内部状態、classification hold をすべて破棄し、次の `update()` を初回 frame として扱う。
- [ ] unit test で、初回 frame、tracked 連続 frame、suspect downweight、lost frame、invalid dt、classification hold、`reset()` 後の再初期化を検証する。
- [ ] `documents/design/frontend/character/motion.md` に、Phase 5 の estimator v1 は observed frame の state/filter/hysteresis までで、prediction/recovering と VRM pose smoothing は後続タスクで扱うことを同期する。

## 設計判断（着手前に確定済み）

- estimator は stateful class とする。One Euro Filter と classification hysteresis は前フレーム状態を持つため、pure function に previous state を毎回渡す案より、`reset()` を明示した class の方が runtime / replay の lifecycle と対応しやすい。
- One Euro Filter は `src/character/temporal/oneEuroFilter.ts` に置く。既存 `features/gaze/characterGaze/oneEuroFilter.ts` を直接 import すると gaze feature から character motion pipeline への逆向き依存が生じるため採用しない。
- v1 は Kalman Filter を入れない。roadmap は One Euro / Kalman を候補にしているが、Phase 5 の最小実装では scalar と wrist tuple の deterministic filter を先に固定し、prediction も次タスクに分ける。
- `predicted` / `recovering` は本タスクでは出さない。state enum は contract に存在するが、observed frame の filter と dropout policy を混ぜるとタスクが大きくなるため、lost は lost のまま返す。
- `ReliabilityMap` が無い場合は canonical confidence だけで state を決める。旧 log / partially recorded frame を replay できることを優先し、reliability 欠損を error にしない。
- `stateAgeMs` と `observedAgeMs` は `mediaTimeMs` 差分だけで更新する。`performance.now()` や render frame time を混ぜると replay 再現性が崩れるため採用しない。
- 外部 API / network / backend 契約は変更しない。入力は TypeScript 型境界の内部 object であり、log 境界の検証は依存タスクの `parseTemporalUpperBodyState()` に任せる。

## スコープ境界

- 本タスクでやること:
    - Phase 5 用 One Euro Filter。
    - `TemporalStateEstimator` の observed frame state transition。
    - arm scalar / wrist tuple の filtering と velocity 計算。
    - classification hysteresis。
- 本タスクでやらないこと:
    - dropout 中の constant-velocity prediction。
    - `Recovering` blend と comfortable pose 退避。
    - motion-debug recording / replay / viewer への接続。
    - quaternion smoothing、IK pole blend、VRM final pose smoothing。

## 実装方針（既存コード整合: file:line）

- `CanonicalUpperBodyState` は腕の body-local scalar と tuple を JSON 保存可能な型で持っている（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:83`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:94`）。estimator はこの値を入力にし、MediaPipe landmark を再解釈しない。
- Phase 4 downstream は reliability を canonical confidence / source / warnings へ伝播済みである（`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:146`、`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:207`、`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:236`）。本タスクはその confidence を state transition に使う。
- `ReliabilityMap` の state enum には `predicted` / `recovering` も含まれるが、Phase 4 estimator は tracked / suspect / lost だけを返す方針である（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:5`、`documents/design/frontend/character/tracking.md:120`）。本タスクの observed estimator も同じく predicted / recovering を生成しない。
- 既存 gaze 用 One Euro Filter は feature-local に存在する（`sincromisor-frontend/src/features/gaze/characterGaze/oneEuroFilter.ts:1`）。character temporal 用には同等の数式を `src/character/temporal` 配下へ置き、テストで deterministic output を固定する。

## テスト

- `cd sincromisor-frontend && npm run test -- oneEuroFilter`
- `cd sincromisor-frontend && npm run test -- temporalStateEstimator`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な motion pipeline の挙動が変わるため、`documents/design/frontend/character/motion.md` に estimator v1 の入力、state threshold、reliability 集約、age / warning 生成規則、filter 初期値、prediction/recovering を後続へ残す責務境界を同期する。公開 WebRTC / backend 契約は変更しない。
