# Implementation Log: task-260712044931-expose-calibration-retry-ui

## Completion Summary

- Initial calibration retry controller に idle / active / cancelled state、sessionId付き action / result union、nonmutation guardを実装した。
- precheck / neutral / a_pose / hand_open の retry cascade、ready step retry、ready_without_hands の任意 hand retry、cancel / new session lifecycleを実装した。
- sincro settings の camera sectionへ current step、summary、先頭 guide、記録済みstepの「再試行」actionを接続した。
- state / UI interaction tests と motion / app-shell 設計を同期した。

## Verification

- `cd sincromisor-frontend && npm test -- --run character/calibration/__tests__/initialSincroCalibrationController.test.ts pages/simpleVrm/react/__tests__/initialCalibrationRetryCard.test.tsx`: PASS（7 tests）
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS（lint / build / 76 test files、525 tests。1 file / 2 tests skipped）

## Not Run

- 実カメラからの calibration step result 記録は既存 algorithm owner の後続統合確認に委ねる。
- gate の Markdown check を通すため、基点に存在した直前タスクの未整形 `eval.md` / `impl.md` 2件を Prettier で機械整形した。意味内容の変更はない。

## TypeScript Production Comment Audit

| path                                                                                        | symbol or decision                       | kind                  | current comment                     | decision | required maintenance knowledge                                                     | action                                   | reviewer note                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------- | ----------------------------------- | -------- | ---------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| `sincromisor-frontend/src/character/calibration/initialSincroCalibrationController.ts`      | state / action / result unions           | public contract       | なし（新規）                        | add      | idle/cancelledにsession fieldなし、session identity必須、guard failure非mutation   | unionごとに契約TSDocを追加               | stale/inactive/already_active/step_missingで同一state参照を返すこと |
| 同上                                                                                        | retry cascade                            | heuristic / lifecycle | なし（新規）                        | add      | precheck全削除、neutral downstream削除、a_pose/hand_open自身のみ、readyもretry可能 | retry method TSDocと単一cascade helper   | ready_without_handsがhand retryなしでも完了扱いであること           |
| 同上                                                                                        | sessionId stale guard / lifecycle cancel | lifecycle             | なし（新規）                        | add      | ownerはactive idでcancelし、再開は新id、旧callback拒否                             | class TSDocとactiveFor guard             | cancel後session dataを保持せず旧idが無効なこと                      |
| `sincromisor-frontend/src/pages/simpleVrm/react/components/initialCalibrationRetryCard.tsx` | `InitialCalibrationRetryCard`            | public UI action      | なし（新規）                        | add      | state解釈のみを担い、guard/cascadeはcontrollerへ委譲、未記録stepはactionなし       | component TSDocを追加                    | current step / summary / first guide / retryのみ表示すること        |
| `sincromisor-frontend/src/pages/simpleVrm/react/useSimpleVrmPanelState.ts`                  | camera / talk lifecycle bridge           | lifecycle             | start/stop/settings委譲コメントのみ | rewrite  | stopとsincro離脱/camera変更はactive session idでcancelする                         | cancel helperを追加し既存actionsから呼ぶ | camera guide stateを変更せずcalibration stateだけ更新すること       |

## attempt 2

### Evaluation feedback response

- `InitialSincroCalibrationPoseBridge` を追加し、production Pose callback owner が生成済み reliability / camera quality / canonical と media time を既存 `evaluateInitialCalibrationStep()` へ渡し、active sessionId付き `record` actionを dispatchするよう接続した。
- controller を production singleton / subscription surface にし、record後の summary / guide / current step を React stateへ即時publishするようにした。retryでstep entryが削除されるとPose bridgeのduration generationも変わり、同stepを0msから再計測する。
- `dialog_vrm_ui_state.vrmStatusText` のproduction eventをpanel stateへ渡し、VRM source表示の変更時にactive session idでcancelするownerを追加した。cancel後に別sessionをstartし、旧session callbackをstale_sessionで拒否するintegration testを追加した。
- evaluator result → record → summary/guide → retry click → same-step remeasurementを通すproduction bridge testを追加した。

### Verification

- `cd sincromisor-frontend && npm test -- --run character/calibration/__tests__/initialSincroCalibrationController.test.ts pages/simpleVrm/react/__tests__/initialCalibrationRetryCard.test.tsx pages/simpleVrm/react/__tests__/initialCalibrationProductionBridge.test.tsx pages/simpleVrm/react/__tests__/panelCameraGuideState.test.tsx`: PASS（4 files / 16 tests）
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS（lint / build / 77 test files、527 tests。1 file / 2 tests skipped）

### Comment audit additions

| path                                                                                   | symbol or decision                   | kind                        | current comment    | decision | required maintenance knowledge                                                                 | action                                         | reviewer note                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------- | ------------------ | -------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `sincromisor-frontend/src/character/calibration/initialSincroCalibrationPoseBridge.ts` | `InitialSincroCalibrationPoseBridge` | production algorithm bridge | なし（新規）       | add      | Pose owner入力、既存step evaluator再利用、active sessionId、retry後duration reset、stale guard | class TSDocを追加                              | raw tracker値を再解釈せず reliability/camera/canonicalを渡すこと |
| `sincromisor-frontend/src/character/calibration/initialSincroCalibrationController.ts` | subscription / record publish        | public lifecycle            | state mutationのみ | rewrite  | start/record/retry/cancel成功時だけReact subscriberへpublishし、guard failureはnotifyしない    | singleton subscriberとsuccess helperを追加     | result record直後にsummary/guideがUIへ届くこと                   |
| `sincromisor-frontend/src/pages/simpleVrm/react/useSimpleVrmPanelState.ts`             | VRM lifecycle owner                  | lifecycle                   | camera/talkのみ    | rewrite  | 初回snapshotではcancelせず、VRM status sourceの変更だけactive idでcancelする                   | event state比較effectと共通cancel helperを追加 | cancel後旧session recordがstaleになること                        |
