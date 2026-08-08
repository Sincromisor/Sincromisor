# Pion Phase 3のproduction candidateを実測してGate 3を判定する

## 背景 / 目的

既存repository testと現行Frontendのbrowser smoke testを対象commitで実行し、Gate 3を判定する。
新しいharness、test client、report schema、production codeは追加しない。

## 完了条件（受け入れ条件）

- [ ] 対象commit、Frontend `dist`、固定WAV、管理対象のGo、Node.js、Chromium、Consul、FFmpeg実行fileを確認する。
- [ ] browser harnessを実行し、接続、1 turnの会話、利用者text、応答text、`telop_ch`、非無音の合成音声と、
      Pion sourceを一時directoryへbuildした事実を確認する。
- [ ] module rootでtagなし`go test ./...`と`go vet ./...`を実行する。
- [ ] root gateとtask checkを実行する。
- [ ] `artifacts/gate-3-result.md`へ対象commit、環境、実行command、結果、未観測、残リスク、
      `gate_3_result`を記録する。
- [ ] 必須commandがPASSした場合だけ`gate_3_result: PASS`とする。
- [ ] 判定とPhase 4へ進めるかを`documents/migration/pion/roadmap.md`へ反映する。

## 設計判断

- Gate専用の境界client、scenario inventory、resource collector、report schemaは作らない。
- `offer_revision`、ICE restart、HTTP上限、codec形式、panic recoveryは既存repository testを証拠とし、
  browser smoke testへ重複させない。
- Gate結果とtask evaluatorの判定を分ける。必須commandがFAILした場合は、揮発する証拠を環境復旧前に採取し、
  直接原因を特定して修正・再検証する。
- raw browser trace、音声、本文は
  `work/private-artifacts/task-260802033044-pion-phase-3-production-candidate-gate-3/`へ置く。

## スコープ境界

- 本タスク: 既存harnessの簡素化、既存commandの実行、証拠保存、Gate 3判定、migration roadmap更新。
- スコープ外: 新規harness・production codeの変更、詳細baseline、network impairment、長時間soak、
  compose切替、運用切替。

## テスト

- 完了済みbrowser harnessの固定command
- module rootの`go test ./...`と`go vet ./...`
- root `npm run gate`
- `npm run tasks:check`

実際のcommandは対象commitに存在するREADMEとpackage scriptを正本とし、本taskへ複製しない。

## ソースコードコメント受け入れ条件

production codeは変更しない。harnessを変更する場合は`documents/rules/source-comments.md`を確認する。

## ドキュメント同期の要否

要。`documents/migration/pion/roadmap.md`へGate 3 artifact、判定、次phase可否を記録する。
stable endpoint切替前のためcurrent Python設計文書は変更しない。

## 文書の言語

説明文は日本語を用い、command、環境変数、schema値だけ原表記を残す。
