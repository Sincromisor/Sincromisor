# 未確認範囲と再開条件

macOS arm64ホストにFFmpeg、Consul、Dockerがないため、実プロセスとブラウザーを結合した音声確認は実行できていない。FFmpegを代用品へ差し替えて試験を成功扱いにしていない。

`go test ./...`はFFmpegを呼ぶ子プロセスの終了後も登録通知を待つため、今回の試験プロセスだけへSIGQUITを送りスタックを保存した。`TestLoad`系も同じ未導入が原因で失敗した。`TestInputProcessorOpusToS16LEGolden`と`TestValidatedGoPathBuildsAndRerunsEvidence`の失敗は旧依存コピーで再現し、更新による悪化ではない。

確認できたrace検査は次の範囲である。

```sh
cd sincromisor-server/sincro-rtc
GOTOOLCHAIN=go1.26.9 TMPDIR=/private/tmp go test -race -skip 'TestProcessRegistersReadyServiceAndDeregistersOnSIGTERM|TestProcessSIGTERMStopsHTTPAndJoinsActiveSession|TestLoad|TestInputProcessorOpusToS16LEGolden' ./...
```

FFmpegとConsulが使える開発環境で全試験と実接続・音声入出力・切断を確認し、Dockerが使える環境で両Goビルド段を確認して完了する。
