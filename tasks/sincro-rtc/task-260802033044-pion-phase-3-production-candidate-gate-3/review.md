# レビュー: task-260802033044-pion-phase-3-production-candidate-gate-3

## 判定

APPROVED

## 理由・申し送り

- Gate判定は一意かつ検証可能である。固定commandと同じnetwork namespaceでPlaywright CLIと固定`127.0.0.1:8500`を含む事前条件を成立させ、その後の1回だけを有効測定とする。条件を解消できなければ`NOT_MEASURED`、有効測定開始後の必須command失敗は`FAIL`、全件PASS時だけ`PASS`となるため、sandbox側だけの空きport観測をGate結果へ誤分類しない。
- Playwright CLI欠落の事前検査は、現行`internal/gate3/harnessenv.Load`がrepository所有入力を子process起動前に一括検査し、`browser_test.go`がrootの`node_modules/@playwright/test/cli.js`を固定pathで起動する契約に一致する。欠落時に外部process起動前に失敗するunit testも受け入れ条件へ追加され、既知の失敗を回帰検証できる。
- Consulの`127.0.0.1:8500`固定と既存processを変更せず競合を拒否する挙動は、現行`consuldev.Start`のproduction契約と一致する。port可変化や新しいpreflight層は不要であり、既存harnessの最小変更として実装できる。
- resource収束の完了条件は現行`resources.Sampler`の契約と一致する。Pion readiness後かつPlaywright起動前に`CaptureBaseline`で3 sampleの最大値を確定し、Playwright終了後かつPion停止前に`WaitForConvergence`を呼べば、10秒以内にactive sessionと4 queueが0、FDとsocketがbaseline+2以下となる3回連続sampleを既存実装だけで検証できる。
- browser testが最上位ownerであり、Playwright終了後もPionを生存させ、収束確認後に既存cleanupでPion、Consul、契約serviceを逆順joinする生存期間と失敗順序は明確である。現行`process.Owner`はrunning中のPIDを公開していないため、Samplerの`Config.PID`へ渡す最小のinternal accessorが必要になる場合は、状態別失敗条件、doc comment、owner testを同時に確認すること。
- 対象はPlaywright CLI事前検査、既存Samplerのbrowser ownerへの接続、既存commandの有効測定1回、証拠、Gate判定、roadmap同期に限定され、production code、新規harness、詳細baseline、network impairment、soak、compose・運用切替は非対象として明確である。
- 必要なrepository test、browser harness、lifecycle test、Frontend / root / task checkと、公開成果物`artifacts/gate-3-result.md`、検証計画`documents/migration/pion/validation-plan.md`、Phase可否`documents/migration/pion/roadmap.md`の同期先が示されている。公開通信契約は変更しない。
- 実装時のコメント確認はtask本文へ規約を複製せず、`documents/rules/source-comments.md`を直接参照すること。
