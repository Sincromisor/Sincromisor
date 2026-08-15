# Pion Gate 4の実下流ブラウザUI smoke手順を整備する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

Gate 4 は、実下流を使うPionとrollback後のaiortcで、現行Frontendから1 turnの会話が成立することを
最小条件としている。しかし既存のGate 3 Playwright testはmock固定文を検査するため、production相当の
可変応答を判定できず、現行Gate 4はbrowser UI smoke手順がないことを理由に`blocked`となっている。

既存FrontendのDebug ConsoleとPionのstage logを使い、固定本文を比較せずに利用者/応答text、telop、
非無音音声を観測する最小の手順を、Phase 4 runbookのPionとaiortc rollbackの両方で使える形にする。

## 完了条件（受け入れ条件）

- [ ] `documents/migration/pion/phase-4-cutover-runbook.md`に、stable endpoint、すでに起動済みの
      Frontend・下流service、Gate 3で成立済みのChromeを前提とするbrowser UI smoke手順を記す。
      手順は接続開始、通常の1発話、利用者/応答text、telop、非無音の合成音声、通常終了後の
      `/statuses`によるactive session収束を確認できる。
- [ ] 手順は実下流の本文を固定値と比較せず、既存Gate 3 Playwright testのmock固定文を
      production相当Gate 4の判定に使わないことを明記する。
- [ ] Pion smokeとrollback後aiortc smokeで同一手順を各1回実行する箇所、Pion側で確認する
      `recognizer_result_received`から`synthesizer_result_received`までのstage log、codec error時に
      private evidenceへ残す情報を、既存runbookの記録方針と矛盾なく参照できる。
- [ ] 手順の実行は本タスクでは行わず、現行Gate 4 task
      `task-260809020145-pion-phase-4-cutover-rehearsal`が最初から1回実行して判定する責務として残す。

## 設計判断

手動UI smokeをGate 4の唯一の実下流観測手段とし、新しいbrowser harness、入力注入、固定応答用の
test serviceは導入しない。音声の判定は利用者が聴取する非無音音声とし、payload・会話本文・session ID・
SDP・candidateはGit管理下へ保存しない。

runbookを手順の正本とする。network、container、readinessの前提確認と切替・rollback commandは既存節を
再利用し、本タスクで値や構成を新設しない。

## スコープ境界

- 本タスク: Gate 4 runbookへ最小browser UI smoke手順と観測・記録境界を追加する。
- 後続: `task-260809020145-pion-phase-4-cutover-rehearsal`がproduction相当環境で手順を実行し、
  Gate 4を判定する。
- スコープ外: Pion / aiortc / Frontend / Python下流serviceの実装変更、Playwright testの実下流対応、
  browser matrix、Docker crash復旧、soak、性能比較、network再監査、実環境リハーサルの実行。

## 実装方針

`sincro-rtc-pion-poc/README.md`にある既存Debug Consoleとstage logの確認点を、
`documents/migration/pion/phase-4-cutover-runbook.md`のPion smokeとrollback節から共通参照できる
短い手順へ整える。既存のprivate evidenceとGate 4 artifactの記録規則を再利用する。

## テスト

- runbookのPion smokeとrollback節を相互確認し、同じ観測項目、固定文非依存、private evidenceの境界が
  受け入れ条件どおりであることを確認する。
- `npm run tasks:check`、`npm run tasks:index:check`、`npm run gate`を実行する。

## ドキュメント同期の要否

要。Gate 4実行手順の正本である`documents/migration/pion/phase-4-cutover-runbook.md`を更新する。
公開API、通信契約、runtime設定は変更しない。
