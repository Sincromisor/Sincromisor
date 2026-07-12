# Capture M1 MacBook Air motion validation suite

## 背景 / 目的

Gesture baseline のためだけに撮影を行うと、Temporal / IK / ROI / CameraQuality の実機確認で同じ人物・環境の
再撮影が必要になる。MacBook Air (M1) の内蔵カメラを最初の基準環境に固定し、現行 Gesture performance gate と
ロードマップの主要な captured replay / 実機確認に再利用できる素材を一度に収録する。

本タスクは `task-260712044932-capture-gesture-camera-performance-baseline` を包含して置き換える。production
code の tuning と収録を混ぜず、原本は非公開領域、再現可能な集計と判定だけを公開 task artifact に残す。

## 完了条件（受け入れ条件）

- [ ] 基準環境を MacBook Air (M1) の内蔵カメラ、`balanced` profile、同一ブラウザ、同一照明・カメラ位置・
      被写体距離に固定する。manifest には macOS / browser version、camera width / height / fps、照明記述、profile、
      Gesture pass mode、開始時刻を保存し、`deviceId` / `groupId` は hash を含め保存しない。
- [ ] Gesture baseline は次の順序と長さで、Gesture pass `on` / `off` を各1回収録する: neutral 30秒、wave左15秒、
      wave右15秒、pointing左15秒、pointing右15秒、thumbsUp 15秒、peace 15秒、左手lost→recovered 15秒、右手
      lost→recovered 15秒。1 mode 150秒、2 mode 合計300秒とし、mode間で変更してよい設定は Gesture pass control
      だけとする。
- [ ] 将来再利用用 suite は Gesture pass `on` で次を別segmentとして収録する: 片腕slow raise左15秒・右15秒、
      両腕slow raise 15秒、arms cross→return 20秒、hand near face→return左15秒・右15秒、fast hand motion左15秒・
      右15秒、wrist rotation + hand open/close左15秒・右15秒、camera framing variation 45秒、calibration 3-step
      15秒。追加合計215秒とし、baselineと合わせた人物動作時間を515秒（8分35秒）に固定する。
- [ ] `camera framing variation` は中央neutral 5秒、上半身を画面左端5秒、右端5秒、近距離10秒、遠距離10秒、
      片手を画角境界へ出し入れ10秒の順とする。`calibration 3-step` は正面自然姿勢5秒、軽いA pose 5秒、両手を
      軽く開いた姿勢5秒とする。動作を誤ったsegmentだけを再収録し、採用版をcapture logで一意に指定する。
- [ ] Motion Debug recording 原本を
      `work/private-artifacts/task-260712171317-capture-m1-macbook-air-motion-validation-suite/recordings/`、映像原本を
      同 `video/` に置く。各採用ファイルの SHA-256、segment ID、期待時間、実時間、採否、再撮影理由を公開
      `artifacts/capture-manifest.json` に記録する。実写映像、frame単位raw NDJSON、screenshotはGitへ追加しない。
- [ ] 公開 artifact は `artifacts/metrics.json`、`artifacts/verdict.md`、`artifacts/capture-manifest.json` に固定する。
      `metrics.json` は Gesture on/offそれぞれの duration、frameCount、`gestureInferenceDurationMsP95`、
      `totalTrackerDurationMsP95`、`ownedBoneConflictCount`、`gestureFlickerPerMinute`、neutral false-positive ms、
      degradationRate、on-off degradation差、各gateのbooleanを持つ。
- [ ] gate は `gestureInferenceDurationMsP95 <= 12ms`、`totalTrackerDurationMsP95 <= 28ms`、
      `ownedBoneConflictCount = 0`、`gestureFlickerPerMinute <= 6`、neutral false-positive `<= 1000ms`、on-off
      degradationRate差 `<= 0.05` とし、境界値はPASSとする。公開値は採用NDJSONから再計算し、invalid duration
      warningが1件でもあればverdictをPASSにしない。
- [ ] Gesture gateの母集団はon/offともbaseline 9 segmentの採用範囲だけとし、追加suiteを含めない。
      `duration`はbaseline各segmentの指定終端−指定開始の合計、`frameCount`はその半開区間
      `[segmentStart, segmentEnd)` に属するframe数とする。`ownedBoneConflictCount`は対象frameの既存metric全件合計、
      `gestureFlickerPerMinute = gestureFlickerCount合計 / (durationMs / 60000)`、
      `degradationRate = degradationFrameCount / frameCount` とし、frameCount 0はinvalidでPASS不可とする。
- [ ] neutral false-positiveはneutral segment内で`intent.gesture != none`のframeが占める時間を合計する。各frameの
      寄与は`min(nextFrame.mediaTimeMs, segmentEnd) - currentFrame.mediaTimeMs`、最終frameは
      `segmentEnd - currentFrame.mediaTimeMs`とし、負値・非有限・timestamp逆行はinvalidでPASS不可とする。Gesture
      skipped/missingは`none`として捏造せず、missing countをmetricsへ出し、1件でもあればfalse-positive gateをPASSにしない。
- [ ] 全gate PASSなら`verdict.md`にsemantic/finger rollback削除のevidenceとしてPASSを明記する。基準超過またはinvalid
      ならFAILとし、metric名、該当segment、frame range、再現条件、後続tuning task候補を列挙する。FAILでも原本・metrics・
      manifestは保持し、基準値を変更してPASS扱いにしない。
- [ ] 映像原本は各segmentの開始・終了、左右、全身/上半身の可視性を人手確認し、capture manifestのSHA-256と
      実ファイルが一致することを確認する。camera permission、保存容量、Motion Debug export、映像保存のいずれかが
      失敗した場合は完了扱いにせず、成功済みsegmentと再開点を`impl.md`へ記録してblockedとして停止する。
- [ ] 独立評価時はmain checkoutの
      `/Users/aki/projects/Sincromisor/work/private-artifacts/task-260712171317-capture-m1-macbook-air-motion-validation-suite/`
      をprivate rootとしてevaluatorへ明示し、評価worktreeからその絶対pathをread-only参照して全採用原本を再計算する。
      原本が1件でも欠損・hash不一致・read不可なら、実装段ではblocked、評価開始後はFAILとし、公開summaryやhashだけで
      再計算を代替しない。
- [ ] production TypeScriptは変更しない。集計helperまたはfixture変更が必要になった場合は別タスク化し、本タスクは
      収録・検証に限定する。

## 設計判断（着手前に確定済み）

- 正式なperformance evidenceはlive-cameraのMotion Debug NDJSONとする。保存済み動画の再推論は端末・camera・
  Worker実時間を再現しないため、performance gateの代替にはしない。
- 映像原本も同時に非公開保存し、将来のtracker再推論、複数VRM比較、IK / Temporal / ROI regression入力に使う。
  公開repoへ動画を置く案はprivacy・容量・`tasks:close`制約のため採らない。
- Gesture `off` は比較に必要なbaseline 150秒だけを撮り、追加suiteは`on`だけにする。追加suiteは将来の姿勢入力を
  残す目的で、Gesture負荷差の比較対象ではないため二重撮影しない。
- 既存 `work/private-artifacts/task-260705214026-canonical-temporal-arm-solver-production/video/` は参考・予行演習に
  限定する。現行recording contractとGesture on/off条件を持たないため正式artifactへ混用しない。
- `capture-manifest.json` は採用・不採用を含む全収録fileを1 entryずつ残す。最小単位は
  `{segmentId, sourceKind, gesturePassMode, expectedDurationSec,
actualDurationSec, relativePrivatePath, sha256, accepted, notes}` とする。private pathは上記task rootからの相対path
  だけを保存し、個人名・raw camera identifier・絶対pathを保存しない。不採用fileは`accepted=false`かつ`notes`へ
  理由を必須とし、集計は同一segment/sourceKindで唯一の`accepted=true` entryだけを読む。

## スコープ境界

- 本タスク: M1 MacBook Air内蔵カメラでの一括収録、private原本管理、Gesture on/off metrics再計算、判定、公開
  manifestとsummary。
- 置換対象タスク: `task-260712044932-capture-gesture-camera-performance-baseline` の全受け入れ条件を本タスクへ統合する。
- 後続タスク: `task-260712044933-remove-semantic-finger-rollback-hook` は本タスクのGesture baseline verdictを削除判断の
  evidenceとして読み、依存IDとevidence pathを本タスク起票時に新task / `artifacts/{metrics.json,verdict.md}`へ付け替える。
- スコープ外: performance tuning、threshold変更、production runtime変更、複数端末・外付けcamera・Safari/mobile
  比較、複数VRM評価、映像の公開。
- Phase 10の端末別performance確認は、対象端末とその時点のcodeで再実行が必要であり、本素材だけで完了扱いにしない。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:224-250` は同一frameのvideo、pose、
  reliability、intent、solver、tracker stats、camera qualityをrecordingへ保存する。
- `sincromisor-frontend/src/character/motionEvaluation/motionTrackerPerformanceSamples.ts:35-92` は旧log欠損とfield単位
  warningを扱い、Gesture / total durationのnearest-rank p95を再計算する正本である。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugMetricsRuntime.ts:88-106` はrecordingからQA regressionを実行する
  既存入口である。
- `tasks/README.md` の「公開artifactと非公開検証原本」に従い、実写動画とraw replayは`work/private-artifacts/`、
  scrub済みmanifest・metrics・verdictだけをtask配下へ置く。
- protocol実行前に空の10秒テスト収録を行い、duration field、camera metadata、export、映像保存、空き容量を確認する。
  preflightは515秒の採用時間へ含めない。

## テスト

- 採用した全private fileのSHA-256を再計算し、`capture-manifest.json`と一致させる。
- evaluatorはGesture on/off NDJSONからmetricsを独立再計算し、`metrics.json`の値、分母、nearest-rank p95、境界判定、
  `verdict.md`を照合する。
- evaluatorはmanifestのsegment ID集合、期待時間合計515秒、actual duration、左右・mode、private file存在、raw camera
  identifier非保存を確認する。actual durationは各segmentで期待値以上を必須とし、余剰frameは指定segment終端で切る。
- production codeを変更しないため`npm run gate`は必須にせず、`npm run tasks:check`とMarkdown format checkを実行する。
  fixture/helperを変更した場合だけ関連focused testと`npm run gate`を追加で通す。

## ドキュメント同期の要否

原則不要。公開API・通信契約・production挙動は変更せず、内部QA evidenceと非公開原本だけを追加するため。
判定によりroadmap現在地が変わる場合だけ`documents/research/character_animation/roadmap.md`へ実施日、基準環境、公開
artifact linkを同期する。

## Comment audit / 評価条件

production TypeScriptを変更しないためcomment audit対象外。収録中にproduction変更が必要と判明した場合は本タスクへ
混ぜず、別タスクを起票して本タスクをblockedにする。
