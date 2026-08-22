# Gate 3 検証ハーネス

## 目的

このディレクトリは、Pion production candidate の既存repository testと、現行Frontendの1 turn browser smokeを接続する。
Gate専用の障害注入、resource collector、report schemaは持たない。

## Frontend ブラウザー試験

repository rootで`npm run gate`を実行してFrontendをbuildした後、module rootで次を実行する。

```sh
go test -tags=gate3 ./internal/gate3/browser -run '^TestFrontendBrowserHarness$' -count=1 -v
```

`SINCRO_GATE3_GO_BINARY`、`SINCRO_GATE3_NODE_BINARY`、`SINCRO_GATE3_CHROMIUM_BINARY`、
`SINCRO_GATE3_CONSUL_BINARY`、`SINCRO_GATE3_FFMPEG_BINARY`には絶対pathを設定する。

Go試験が4契約service、Consul、Pion、Playwrightの順に起動し、逆順に停止・joinする。
現行`/simple-vrm/index.html`で固定WAVをmicrophone入力として使い、接続、1 turnの利用者text・応答text、
`text_ch`、`telop_ch`、非無音の合成音声を確認する。Pion sourceは試験ごとの一時directoryへbuildする。

固定Extractorは最初の非無音PCMだけへfixture結果を返す。発話境界、PCM品質、ICE restart、2 turnは
既存repository testの責務であり、このsmokeへ重複させない。

## 子 process

`process.Owner` は`new → running → exited`の単調状態を持つ。`Close`はSIGTERM後も終了しなければ
SIGKILLを送り、background waiterをjoinする。
