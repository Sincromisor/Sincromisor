# Evaluation: task-260624222300-character-animation-3-camera-quality-score

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `createCameraQualityScore(input)` は `sincromisor-frontend/src/features/gaze/trackingRuntime/cameraQualityScore.ts` に追加され、`schemaVersion: "sincro.camera-quality.v1"`、`overall`、`components`、`reasons`、`guideMessages`、`track`、`sample` を返す。根拠: commit `dc11aa3` / `cameraQualityScore.test.ts`
- [✓] `track` は scrub 済みの `width`、`height`、`frameRate`、`facingMode`、`readyState` のみを保存し、raw `deviceId` / `groupId` / `label` を `CameraQualityScore` に含めない。根拠: `scrubTrackSettings()` と raw ID 非包含テスト
- [✓] 7 component は `resolution`、`cadence`、`torsoInFrame`、`handsInFrame`、`borderRisk`、`handSmallRisk`、`motionBlurRisk` を持ち、score は `good = 1`、`warn = 0.55`、`bad = 0`、`unknown = 0`、overall は全 7 component 平均と task.md の status 閾値で算出される。根拠: `cameraQualityScoreComponents.ts` / overall 閾値テスト
- [✓] resolution は track settings を優先し、fixture source では video size fallback を使う。cadence は直近 30 frame の media-time interval と dropped frame から unknown / good / warn / bad を判定する。根拠: `cameraQualityScore.test.ts`
- [✓] torso / hands、borderRisk、handSmallRisk、motionBlurRisk は task.md の閾値で判定される。borderRisk は全対象点欠損を unknown、外側 / 0.04 / 0.08 閾値を bad / warn に分け、motion blur は cadence / actual `frameRate` / 低 confidence 継続だけを見る proxy に留まる。根拠: `cameraQualityScoreComponents.ts` / component 別テスト
- [✓] guide message は reason code priority に基づき deterministic に最大 3 件へ制限され、固定 5 文言だけを使う。同じ文言に複数 reason が対応する場合は高優先 code と重い severity を採用する。根拠: `cameraQualityGuideMessages.ts` / guide message 上限テスト
- [✓] `motion-debug` live snapshot は source が `camera` / `fixture` のとき `camera.quality` を持ち、source `none` では score を生成しない。viewer camera layer は live では `camera.quality` を含む camera state、replay では `frame.metrics.cameraQuality` を manifest camera より優先する。根拠: `motionDebugApp.ts` / `motionDebugViewerModel.test.ts`
- [✓] recording は `MotionDebugRecorder.recordFrame()` 入力の `frame.metrics.cameraQuality` に保存し、top-level `cameraQuality` を増やさない。根拠: `motionDebugRecordingController.ts` / `motionDebugRecorder.test.ts`
- [✓] 指定テストは追加・更新済み。`cameraQualityScore.test.ts` は resolution、cadence unknown / good / bad、torso border、hands out-of-frame、hand small、motion blur proxy、guide message 上限を検証し、viewer / recorder テストも live / replay / metrics 保存境界を検証している。
- [✓] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` は CameraQualityScore v1 の保存場所、raw device identifier 非保存、固定 guide message、ReliabilityMap 未接続を同期している。

## テスト結果

- 実行コマンド: `npm run gate`
- 実行場所: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-dc11aa314d94-6YyeRW`
- 結果: passed。`gate:lint`、`gate:build`、`gate:test` はいずれも `dc11aa3 (clean)` の cache hit。test summary は `87 passed (87)`。
- カバレッジ評価: 受け入れ条件の scorer 閾値、guide message、snapshot / replay viewer、recording 保存先、raw device ID scrub は unit test で十分に押さえられている。実カメラの手動確認は実装ログどおり未実行だが、sandbox の device permission 制約によるもので、pure scorer と motion-debug 境界は自動テストで代替できている。

## ドキュメント整合性

- 公開通信契約の変更はない。
- developer 向けの公開挙動として motion-debug snapshot / recording frame / viewer camera layer の内容が増えているが、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に同期済み。
- 生成物や API schema の再生成対象は確認されなかった。

## 残課題（FAIL の場合）

- なし。
