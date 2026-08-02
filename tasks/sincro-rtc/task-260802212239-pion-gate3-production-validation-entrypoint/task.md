# Pion Gate 3本番検証エントリーポイントを統合する

## 背景 / 目的

独立実装済みの共通基盤、下流契約、Frontendブラウザー、境界clientを固定scenarioへ組み立てる。
本タスクは新しい障害注入機能を作らず、各部品の公開契約を使って自己検証用commandと
実4 Pythonサービス用commandを提供する。

## 完了条件（受け入れ条件）

- [ ] module rootで
      `go test -tags=gate3 -count=1 ./internal/gate3/... ./cmd/pion-poc -run 'HarnessContract' -v`
      を自己検証commandとして提供し、契約サービス、現行Frontend、Pion本番実行ファイルを接続する。
- [ ] module rootで
      `go test -tags=gate3 -count=1 ./cmd/pion-poc -run '^TestGate3ProductionCandidate$' -v`
      を実測専用commandとして提供する。実4サービス、Frontend `dist`、5実行ファイル、
      固定WAVのいずれかが欠けた場合はskipせず、欠落項目を列挙してerrorにする。
- [ ] 実測commandは`SINCRO_GATE3_{EXTRACTOR,RECOGNIZER,PROCESSOR,SYNTHESIZER}_ORIGIN`を
      必須とし、`ws://`または`wss://`の絶対URLだけを受理する。
- [ ] `cmd/pion-poc/gate3_production_test.go`は既存部品をscenario IDへ対応付け、
      自身ではbrowser制御、proxy、境界client、資源採取を再実装しない。
- [ ] 固定scenario inventoryはFrontend 2 turn / ICE restart、4 service契約と障害、
      signaling response分岐、readiness期限、candidate gathering、normal / abnormal close、
      draining、capacity、process restartを含む。
- [ ] 既存単体・結合試験で証明済みの冪等性、revision、各上限、RTP / RTCP、panic、
      rollbackは対象commit、絶対Go path、固定command、test名、期待値を成果物へ取り込む。
      test名不存在、対象commit不一致、skip、非0終了は未観測ではなくerrorにする。
- [ ] 全scenarioを`PASS`、`FAIL`、`NOT_OBSERVED`のいずれかで成果物へ1行ずつ記録し、
      `FAIL > NOT_OBSERVED > PASS`で集約する。必須行の欠落や重複をschema検証で拒否する。
- [ ] 自己検証成果物`artifacts/harness-contract.md`へ固定command、必要環境、scenario inventory、
      部品task、観測点、成果物schema、自己検証結果を記録する。本番Gate判定は記録しない。
- [ ] 変更対象と変更理解範囲のコメント点検を`impl.md`へ全件記録する。

## 設計判断（着手前に確定済み）

- `gate3` build tag限定の統合testを`cmd/pion-poc`と同じpackageへ置く。
  本番`runWithBoundaries`または本番build済み子プロセスを使い、production constructorへfakeを追加しない。
- 本番実行ファイルは
  `<SINCRO_GATE3_GO_BINARY> build -trimpath -o <repo>/work/gate3/bin/pion-poc ./cmd/pion-poc`
  で作る。固定表示も実argvも検証済み絶対Go pathに一致させる。
- 実測のJSON原本は
  `work/private-artifacts/task-260802033044-pion-phase-3-production-candidate-gate-3/gate3-run.json`
  固定とし、既存fileを上書きしない。tracked成果物には機密性を確認した集約値とSHA-256だけを置く。
- scenario IDと期待値の正本は本taskのGo inventoryと
  `artifacts/harness-contract.md`の生成表とし、同じ長大表をtask.mdへ複製しない。
- Firefox、NAT、固定UDP mux、network impairment、30分soakはPhase 4へ残す。

## スコープ境界

- 本タスク: 統合test、scenario inventory、実測command、成果物集約、利用文書。
- 依存タスク: 各ハーネス部品とgraceful shutdown本番挙動。
- 後続タスク: 実4サービスでのGate 3実測と判定。
- スコープ外: 新しい注入方法、Pion / Frontend機能変更、Gate結果の判定、compose切替。

## 高リスク統合タスクの追加設計

| 層        | 使用する部品     | 合否の正本                        |
| --------- | ---------------- | --------------------------------- |
| Frontend  | browser harness  | browser、HTTP、下流の3台帳        |
| pipeline  | contract harness | 4 service台帳、generation、metric |
| lifecycle | boundary harness | statuses、metric、資源sample      |
| 既存証拠  | repository試験   | commit、絶対command、test結果     |

各scenarioは依存部品を1つだけ所有者として指し、entrypointは順序、期限、cleanup、集約だけを所有する。
scenario失敗後も残りを安全に実行できる場合は継続し、cleanup失敗時は以後を停止する。

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/implementation-phases.md:131-145`がGate 3条件である。
- `documents/migration/pion/validation-plan.md:41-84`がfunctional / pipeline、
  `:132-218`がnetwork / resource / failure条件である。
- `sincromisor-server/sincro-rtc-pion-poc/cmd/pion-poc/main.go:40-109`の本番startup境界と
  `:150-213`のprocess lifecycleを使う。
- Gate 2の記録形式は
  `tasks/sincro-rtc/task-260726211012-pion-phase-2-pipeline-reset-gate-2/artifacts/gate-2-result.md`
  を参照するが、Gate 2結果をGate 3の代替にしない。

## テスト

- 自己検証commandを契約サービスと管理対象Chromiumで通し、実測専用testが実サービス入力欠落時に
  skipせずerrorとなることを確認する。
- `go test -race -tags=gate3 ./internal/gate3/...`と
  `go test -race -tags=gate3 ./cmd/pion-poc -run 'HarnessContract'`を分けて実行する。
- `go vet -tags=gate3 ./...`、tagなしの`go test ./...`と`go vet ./...`、
  Frontend lint・typecheck・test・build、root `npm run gate`、`npm run tasks:check`を通す。

## ソースコードコメント受け入れ条件

統合entrypoint、scenario inventory、既存証拠のcommand生成、集約、cleanup順序を全件点検し、
規約所定の9列を`impl.md`へ記録する。依存部品との責務境界を単なる参照先だけで済ませず、
入力、出力、失敗、終了責務まで説明する。

## ドキュメント同期の要否

要。`internal/gate3/README.md`を統合利用手順として完成させ、
`documents/migration/pion/validation-plan.md`から6つの分割task、
`artifacts/harness-contract.md`、後続Gate実測taskへ導線を追加する。
Gate判定前のためcurrent Python設計文書は変更しない。

## 文書の言語

説明文と表見出しは一般的な日本語を用い、command、scenario ID、環境変数、schema値だけ原表記を残す。
