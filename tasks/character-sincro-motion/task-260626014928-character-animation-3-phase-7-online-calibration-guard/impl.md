# Implementation Log: task-260626014928-character-animation-3-phase-7-online-calibration-guard

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 変更内容

- 実装コミット: `56d0df0 feat(character): add online calibration guard`
- `onlineSincroCalibration.ts` を公開入口として追加し、required exports を提供した。
- 実体は責務別に gate / parser / snapshot clone / state update / types へ分割した。単一ファイルが規約のサイズ閾値を超えないようにするため。
- gate close は review.md の Medium 指摘どおり、calibration 値は進めず、candidate reset と freezeReasons 更新だけ行う実装にした。
- drift clamp は停止理由ではなく debug reason として残し、clamp 済み値で candidate / committed 更新を継続する実装にした。
- `documents/design/frontend/character/motion.md` に online calibration の更新対象、変更禁止対象、gate、drift clamp、debug 表示項目を同期した。

### 確認結果

- `npm run test -- onlineSincroCalibration initialSincroCalibration` PASS
- `npm run check` PASS
- `npm run build` PASS
- `npm run gate` PASS（commit `56d0df0` clean）

### 未実行確認

- ブラウザ UI / motion-debug での手動確認は未実行。今回のスコープは pure module、unit test、設計文書同期であり、UI・永続化・viewer 接続は対象外。

### 残リスク

- first gate-open frame は前回 candidate がないため sample 値を直接 candidate 初期値にする。以後は `mediaTimeMs` 差分の EMA で更新する。
- online calibration はまだ runtime UI、localStorage/settings、motion-debug recording/viewer へ接続していない。後続 task で接続時に保存先と debug 表示の導線を確認する必要がある。
