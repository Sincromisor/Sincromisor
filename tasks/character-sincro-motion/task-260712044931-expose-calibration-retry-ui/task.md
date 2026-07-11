# Expose initial calibration retry flow in sincro UI

## 背景 / 目的

initial calibration は step判定、retry reason、行動文を持つが production UI から step単位で再試行できない。Phase 7 の実機UX残差のうち、retry操作だけを独立して接続する。

## 完了条件（受け入れ条件）

- [ ] `character/calibration/initialSincroCalibrationController.ts` に状態別unionを追加する: `{status:"idle"}`、`{status:"active";sessionId:string;currentStep:InitialCalibrationStepId;session:InitialSincroCalibrationSession}`、`{status:"cancelled";reason:string;previousSessionId:string}`。idle/cancelledはcurrentStep/sessionを持たない。
- [ ] `dispatch(action)` のdiscriminated unionは `{type:"start";sessionId;mediaTimeMs}`、`{type:"record";sessionId;result}`、`{type:"retry";sessionId;stepId}`、`{type:"cancel";sessionId;reason}` に固定する。
- [ ] sessionId不一致、activeでないrecord/retry/cancel、未記録stepのretryはmutationせず `{ok:false, reason:"stale_session"|"inactive"|"step_missing"}` を返す。startはidle/cancelledからだけ成功し、active中は`{ok:false,reason:"already_active"}`。
- [ ] sincro settings に controller state の current step、summary status、先頭 guide message、`再試行` action を表示する。
- [ ] `retry`/`failed` step の再試行はそのstep entryを削除しcurrentStepを同stepへ戻す。ready stepも明示操作なら同じ規則で再試行可能。precheck retryは全stepを削除、neutral retryはneutral/a_pose/hand_openを削除、a_pose retryはa_poseだけ、hand_open retryはhand_openだけ削除する。
- [ ] camera停止・talk mode離脱・VRM変更event ownerは`cancel(reason)`を呼びstatus=`cancelled`、sessionIdを無効化する。再開は必ず新sessionIdの`start`から行い、旧IDのrecordは`stale_session`。
- [ ] `ready_without_hands` は完了扱いを維持し、hand_openだけを任意再試行できる。再試行しなくてもcharacter開始を妨げない。
- [ ] retry/cancel/precheck cascade/ready_without_hands の state tests と UI interaction tests を追加する。
- [ ] `documents/design/frontend/character/motion.md` と `app-shell.md` にstep retry/cancel境界を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録し、session lifecycle、cascade、public UI actionを対象にする。

## 設計判断（着手前に確定済み）

- calibration algorithmやthresholdは変えず、既存 session contractをUIへ接続する。
- retryはstep単位とし、常に全sessionをやり直す案は採らない。成功済み測定を不要に失わないためである。

## スコープ境界

- 本タスク: current step表示、retry/cancel action、state bridge、tests/docs。
- スコープ外: calibration threshold tuning、multi-VRM比較、camera guide常時表示、online calibration UI。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/character/calibration/initialSincroCalibrationSession.ts:13-28` が session statusとguide messageを集約する。
- 同 file `:56-77` は ready/retry/failed/ready_without_hands を決定する。
- `sincromisor-frontend/src/character/calibration/initialSincroCalibrationStepEvaluation.ts:19` が step retry reasons の生成入口である。

## テスト

- frontend check / build / test、必要なUI interaction test、`npm run gate`、`npm run tasks:check`。

## ドキュメント同期の要否

要。公開UIとcalibration lifecycleが変わるため motion/app-shellを同期する。通信契約は変更しない。

## Comment audit / 評価条件

`impl.md` に `path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note` で全変更symbol/decisionを記録する。最低対象はcontroller state/actions/result、retry cascade、sessionId stale guard、lifecycle event bridge、public UI action。弱い/stale commentのrewrite/deleteと省略理由を記録する。評価者は全件照合し、無効操作、cascade、cancel/restart副作用を説明しないcomment、型の逐語説明、audit不一致をFAILにする。
