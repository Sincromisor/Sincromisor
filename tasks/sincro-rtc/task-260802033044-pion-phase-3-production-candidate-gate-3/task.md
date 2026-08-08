# Pion Phase 3のproduction candidateを実測してGate 3を判定する

## 背景 / 目的

既存repository testと現行Frontendのbrowser smoke testを対象commitで実行し、Gate 3を判定する。
新しいharness、test client、report schema、production codeは追加しない。
既存harnessには、子process起動前のPlaywright CLI検査と、実装済み`resources.Sampler`による
session終了後の数値的なresource収束確認だけを追加する。

## 完了条件（受け入れ条件）

- [ ] 対象commit、Frontend `dist`、固定WAV、rootのPlaywright CLI、管理対象のGo、Node.js、Chromium、Consul、FFmpeg実行fileを事前確認する。
- [ ] 完了済みbrowser harnessを有効な環境で1回実行し、接続、1 turnの会話、利用者text、応答text、
      `telop_ch`、非無音の合成音声、session終了後のresource収束を確認し、対象commitのPion sourceを
      harnessが一時directoryへbuildした事実を記録する。
- [ ] module rootでtagなし`go test ./...`と`go vet ./...`を実行する。
- [ ] 既存のlifecycle testから、代表的なreadiness timeoutとSIGTERMがPASSすることを確認する。
- [ ] Frontend check、root gate、task checkを実行する。
- [ ] `artifacts/gate-3-result.md`へ対象commit、環境、実行command、結果、未観測、残リスク、
      `gate_3_result`を記録する。
- [ ] production candidateの実行開始後に必須commandがFAILすれば`gate_3_result: FAIL`、全件PASSの場合だけ
      `gate_3_result: PASS`とする。Playwright欠落やConsul port競合など、開始前の環境条件で停止した実行は
      Gate判定へ数えない。固定commandと同じnetwork namespaceで事前条件を確認し、条件を直した後の
      1回を有効な測定とする。条件を解消できない場合だけ`gate_3_result: NOT_MEASURED`として停止する。
- [ ] Playwright CLI欠落が外部process起動前の入力検査で失敗することを、既存`harnessenv`のunit testで固定する。
- [ ] browser終了後かつPion停止前に、既存`resources.Sampler`でactive sessionと4 queueが0、
      FDとsocketが開始前baselineの許容範囲へ3回連続で戻ることを確認する。
- [ ] 判定とPhase 4へ進めるかを`documents/migration/pion/roadmap.md`へ反映する。

## 設計判断

- Gate専用の境界client、scenario inventory、resource collector、report schemaは作らない。
- `offer_revision`、ICE restart、HTTP上限、codec形式、panic recoveryは既存repository testを証拠とし、
  browser smoke testへ重複させない。
- Gate結果とtask evaluatorの判定を分ける。ただし`gate_3_result: FAIL`の記録だけでは本測定タスクを
  完了できない。揮発する証拠を環境復旧前に採取し、直接原因を特定して修正・再検証する。
  別taskへ移管する場合は再現手順、証拠、特定済み原因、移管理由、後続task ID、ユーザー了承を必須とする。
- production candidateの品質を観測していない環境起因の起動前失敗を、製品のGate FAILへ変換しない。
  sandboxとhostで異なるnetwork namespaceを事前検査に使わず、有効な環境を確認してから1回だけ測定する。
- raw browser trace、音声、本文は
  `work/private-artifacts/task-260802033044-pion-phase-3-production-candidate-gate-3/`へ置く。

## スコープ境界

- 本タスク: 既存commandの実行、Playwright CLIの事前検査、既存resource samplerのbrowser ownerへの接続、
  証拠保存、Gate 3判定、migration roadmap更新。
- スコープ外: 上記以外のharnessやproduction codeの変更、詳細baseline、network impairment、長時間soak、
  compose切替、運用切替。

## テスト

- 完了済みbrowser harnessの固定command
- module rootの`go test ./...`と`go vet ./...`
- Frontend check
- root `npm run gate`
- `npm run tasks:check`

実際のcommandは対象commitに存在するREADMEとpackage scriptを正本とし、本taskへ複製しない。

## ソースコードコメント受け入れ条件

production codeは変更しない。既存harnessの事前検査とresource収束変更には、入力境界、所有順序、
失敗条件を説明するGo doc commentを現行規約どおり同期する。

## ドキュメント同期の要否

要。`documents/migration/pion/roadmap.md`へGate 3 artifact、判定、次phase可否を記録する。
stable endpoint切替前のためcurrent Python設計文書は変更しない。

## 文書の言語

説明文は日本語を用い、command、環境変数、schema値だけ原表記を残す。
