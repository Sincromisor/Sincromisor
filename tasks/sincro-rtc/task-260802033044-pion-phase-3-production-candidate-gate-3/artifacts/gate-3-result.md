# Gate 3実行結果

## 判定

`gate_3_result: PASS`

既存repository testと、現行Frontendの1 turn browser smokeがPASSしたため、Phase 4へ進める。

## 実行環境

- 対象: この実装commit
- Go 1.26.5、Node.js v24.18.1、Google Chrome 151.0.7922.108
- Consul v2.0.2、FFmpeg 6.1.1-3ubuntu5
- 固定入力: `internal/gate3/testdata/gate3-input.wav`

## 実行結果

- `npm run gate`: PASS
- `go test -tags=gate3 ./internal/gate3/browser -run '^TestFrontendBrowserHarness$' -count=1 -v`: PASS（11.614秒）
- `go test ./...`: PASS
- `go vet ./...`: PASS
- `npm run tasks:check`: PASS

browser smokeはPion sourceを一時directoryへbuildし、接続、1 turnの利用者text・応答text、`text_ch`、
`telop_ch`、非無音の合成音声を確認した。hostの8500を使用する共有Consulは実行中のみ停止し、終了後にhealthyへ復帰した。

## 未観測と残リスク

ICE restart、複数turn、数値的なFD/socket収束、production相当networkはGate 3の対象外であり、
既存repository testまたはPhase 4で確認する。
