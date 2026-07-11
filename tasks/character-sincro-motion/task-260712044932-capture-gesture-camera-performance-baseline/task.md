# Capture real camera gesture reliability and performance baseline

## 背景 / 目的

Phase 4/8/9 は Gesture optional pass の実機 flicker、false-positive、負荷確認を残している。実装tuningと混ぜず、同一protocolのrecordingと判定だけを先に確定する。

## 完了条件（受け入れ条件）

- [ ] 1台の実cameraで neutral 30秒、wave左右各15秒、pointing左右各15秒、thumbsUp/peace各15秒、hand lost/recovered左右各15秒を `balanced` profile で収録し、scrub済み manifest と metrics summary を task artifacts に置く。
- [ ] Gesture optional pass on/off は Debug Console のGesture pass controlだけを変え、同じcamera/lighting/`balanced` profileで各protocolを収録する。metadataはbrowser/OS、camera width/height/fps（deviceId/groupIdなし）、lighting記述、profile、pass mode、開始時刻を保存する。
- [ ] tracker budgetは `runtimePerformanceProfile.ts` のbalanced cadence/budgetを正本とし、`gestureInferenceDurationMsP95 <= 12ms`、`totalTrackerDurationMsP95 <= 28ms` とする。metric fieldが未実装なら計測追加を別task化し本taskをblockedにする。
- [ ] `ownedBoneConflictCount` は全frame合計=0。`gestureFlickerPerMinute = gestureFlickerCount / recordedDurationMinutes <= 6`。neutral false-positiveはneutral区間で`intent.gesture != none`の連続frame時間合計`<=1000ms`。`degradationRate=degradationFrameCount/totalFrameCount`、on-off差`<=0.05`。すべて境界値をPASSとする。
- [ ] 基準超過時は本タスクでtuningせず、metric名・frame range・再現条件ごとに後続task候補を記録する。基準内なら rollback削除判断へのevidenceとして明記する。
- [ ] artifactは本taskの`artifacts/gesture-camera-baseline/{on,off}.ndjson.br`、`metrics.json`、`verdict.md`に固定する。`metrics.json`は各modeのduration/frameCount/p95/conflict/flicker/falsePositiveMs/degradationRateと差分、各gateのbooleanを持つ。manifest scrubは既存serializerに従いdeviceId/groupIdをhash含め保存しない。camera permission等で実行不能なら完了扱いにせずblocked理由を記録する。
- [ ] production code/公開挙動は変更しない。fixtureやtest helperを変更した場合のみ関連testを実行する。

## 設計判断（着手前に確定済み）

- 先に1 deviceの再現可能baselineを作る。複数device/profile/VRMを同一タスクへ含めると原因分離できないため採らない。
- tuningは別タスクにする。計測と改善を同じacceptanceにするとbaselineが移動するためである。

## スコープ境界

- 本タスク: 実camera収録、on/off比較、判定、artifacts。
- スコープ外: estimator/runtime変更、閾値tuning、multi-device、multi-VRM、rollback code削除。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/pages/motionDebug/motionDebugMetricsRuntime.ts:109-127` がrecordingのmetrics/candidate分析入口である。
- `sincromisor-frontend/src/character/reliability/gestureReliabilityEstimator.ts:87-113` がstable durationとweightを記録する。
- `documents/research/character_animation/roadmap.md:93-100` が実機gesture/負荷確認を残差としている。

## テスト

- motion-debugでprotocolを実行しartifactへコマンド/設定/結果を記録。変更がある場合だけfrontend gate。`npm run tasks:check`。

## ドキュメント同期の要否

原則不要。内部QA evidenceのみで公開contractを変えない。判定がroadmap現在地を変える場合だけroadmapの実施日とartifact linkを同期する。

## Comment audit / 評価条件

production TypeScript変更は行わないためcomment audit対象外。計測field不足が判明しても本taskでproduction codeを変更せず後続task化する。評価者は`metrics.json`をNDJSONから再計算し、式・分母・境界・scrub・on/off差分と`verdict.md`が一致しない場合FAILにする。
