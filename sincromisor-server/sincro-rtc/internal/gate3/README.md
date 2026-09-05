# Gate 3 検証ハーネス

## 目的

このディレクトリは、Pion 本番候補の既存リポジトリテストと、現行フロントエンドの1 往復ブラウザ動作確認を接続する。
Gate専用の障害注入、リソース収集処理、報告スキーマは持たない。

## フロントエンドブラウザー試験

リポジトリのルートで`npm run gate`を実行してフロントエンドをビルドした後、モジュールのルートで次を実行する。

```sh
go test -tags=gate3 ./internal/gate3/browser -run '^TestFrontendBrowserHarness$' -count=1 -v
```

`SINCRO_GATE3_GO_BINARY`、`SINCRO_GATE3_NODE_BINARY`、`SINCRO_GATE3_CHROMIUM_BINARY`、
`SINCRO_GATE3_CONSUL_BINARY`、`SINCRO_GATE3_FFMPEG_BINARY`には絶対パスを設定する。

Go試験が4契約サービス、Consul、Pion、Playwrightの順に起動し、逆順に停止・終了待機する。
現行`/simple-vrm/index.html`で固定WAVをマイク入力として使い、接続、1 往復の利用者テキスト・応答テキスト、
`text_ch`、`telop_ch`、非無音の合成音声を確認する。Pion 由来は試験ごとの一時ディレクトリへビルドする。

固定Extractorは最初の非無音PCMだけへ固定データ結果を返す。発話境界、PCM品質、ICE 再接続、2 往復は
既存リポジトリテストの責務であり、この動作確認へ重複させない。

## 子プロセス

`process.Owner` は`new → running → exited`の単調状態を持つ。`Close`はSIGTERM後も終了しなければ
SIGKILLを送り、バックグラウンド待機処理を終了待機する。
