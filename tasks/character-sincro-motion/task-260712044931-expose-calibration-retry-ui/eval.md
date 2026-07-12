# Evaluation: task-260712044931-expose-calibration-retry-ui

## 判定

PASS

## 前回 FAIL の解消確認

- production result bridge: `SincroCharacterMotionEventSink` の Pose / Pose fallback callback が observe-only state の reliability / canonical、同frameの camera quality、media timeを `InitialSincroCalibrationPoseBridge.record()` へ渡す。
- evaluator / record: bridgeはactive controller stateのcurrent stepを読み、既存 `evaluateInitialCalibrationStep()` の結果を同じactive sessionId付き `record` actionとしてdispatchする。raw tracker値やthresholdを再解釈しない。
- React state bridge: production hookとPose bridgeは `InitialSincroCalibrationController.getManager()` の同一singletonを使い、start / record / retry / cancel成功時のsubscription通知でReact `calibrationState`を更新する。guard failure時はnotifyしない。
- retry / remeasurement: retryでcurrent step entryを削除するとbridgeのsession/step/entry generation keyが変わり、次Pose frameを起点にvalid durationを0から再計測する。focused integration testは evaluator result→record→guide→UI click→entry削除→同step再recordを通す。
- VRM lifecycle: `dialog_vrm_ui_state.vrmStatusText` をpanel event stateへ渡し、初回snapshotを除くstatus source変更でactive sessionId付きcancelを呼ぶ。cancelled後に新IDでstartでき、旧IDのrecordはstale_sessionになる。

## 受け入れ条件チェックリスト

- [✓] controller state は idle、activeのsessionId/currentStep/session、cancelledのreason/previousSessionIdの正確なdiscriminated unionである。idle / cancelledはsession fieldsを持たない。
- [✓] action unionはstart / record / retry / cancelの指定payload、result unionはsuccessまたはstale_session / inactive / step_missing / already_activeに固定されている。
- [✓] sessionId不一致、inactive操作、active中start、未記録step retryはstate objectを置換せずfailureを返し、subscriberにもpublishしない。
- [✓] production settingsはactive stateのcurrent step、session summary status、先頭guide message、記録済みcurrent stepの「再試行」を表示する。record成功がReact stateへ即時publishされるため実カメラ経路から到達可能である。
- [✓] retry cascadeはprecheck=全標準step、neutral=neutral/a_pose/hand_open、a_pose=自身、hand_open=自身である。retry / failed / ready entryを同じ規則で扱う。
- [✓] camera停止、sincro mode離脱、camera変更、VRM source表示変更はactive sessionIdでcancelする。cancelled stateはsession dataを保持せず、再開は新sessionId、旧ID callbackは拒否される。
- [✓] `ready_without_hands` は完了扱いを維持し、hand_open entryだけを任意retryできる。retryしなくてもcharacter startを阻害しない。
- [✓] state testsはnonmutation guards、cascade、ready_without_hands、cancel/new ID/stale callbackを覆う。UI testsはsummary/guide/retry clickを覆い、attempt 2 integration testはproduction evaluator/record/subscription/retry/remeasurementとVRM cancel helper/old staleを固定する。
- [✓] `documents/design/frontend/character/motion.md` と `app-shell.md` はstep result producer、singleton state bridge、retry/cancel境界、VRM lifecycleを同期している。
- [✓] TypeScript production comment auditはcontroller contract/cascade/stale guard、public UI、camera/talk lifecycleに加え、attempt 2でPose algorithm bridge、subscription publish、VRM ownerを追記しており実コードと一致する。

## 実装照合所見

- record progression: controllerはready / degraded / skippedで次stepへ進み、retry / failedは同stepに留める。これによりretry UIは失敗entryのcurrent stepを表示し、ready stepも明示操作時には再試行できる。
- duration generation: bridge keyはsessionId、currentStep、current entryのmissing/recorded generationを含む。start、step遷移、retry entry削除で起点を更新し、同generationの連続Pose frameだけdurationを加算する。
- lifecycle identity: bridgeはrecord直前にactive stateからsessionIdを読み、controller guardが最終所有者としてidentityを検証する。cancel helperもactive stateのIDを明示してdispatchする。
- state publish: controllerのsuccess pathだけがlistenerを呼ぶため、React UIはrecord直後のsummary/guideとretry/cancel後のstateを受け取り、invalid操作では不要なrerenderを発生させない。
- public UI boundary: componentはstate解釈とretry callbackに限定され、cascadeやsession guardを再実装しない。内部score/debug fieldsを一般UIへ露出しない。

## テスト結果

- `npm run gate`（評価worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-072866a20de1-Yc3g4w`、commit `072866a20de10ce56d13c5cd5896a2d9e2a7ba64`、clean）: PASS。
- gate内訳: `gate:lint` CACHE HIT PASS、`gate:build` CACHE HIT PASS、`gate:test` CACHE HIT PASS（527 passed / 2 skipped）。
- カバレッジ評価: controller pure state、UI interaction、production evaluator→record→publish→retry→remeasurement、VRM cancel / stale IDの主要契約は十分に覆われている。独立acceptance testの追加は不要と判断した。

## ドキュメント整合性

- motion設計はproduction Pose result bridge、retry duration reset、session lifecycle/cascadeを説明しており実装と一致する。
- app-shell設計はsingleton controller subscriptionとsettings表示契約を説明しており実装と一致する。
- backend / WebRTC契約変更はない。

## 残課題（FAIL の場合）

- なし。

## その他所見

- 実カメラでのUX確認は未実施だが、production callback wiringとdeterministic state lifecycleはintegration/state testで固定されており、本タスクのPASSを妨げない。
