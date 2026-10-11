# RTC統合試験

## 目的

現行フロントエンドとGo / Pionサーバーを実際に接続し、会話1往復の経路を確認する。
下流の音声抽出・認識・応答生成・音声合成には固定データを返す模擬サービスを使うため、実サービスの動作確認は別途必要となる。

## フロントエンドブラウザー試験

リポジトリのルートで`npm ci`と`npm run build`を実行し、依存関係とフロントエンドの配信ファイルを用意する。
次の環境変数には、実行可能なファイルの絶対パスを設定する。

- `SINCRO_RTC_INTEGRATION_GO_BINARY`
- `SINCRO_RTC_INTEGRATION_NODE_BINARY`
- `SINCRO_RTC_INTEGRATION_CHROMIUM_BINARY`
- `SINCRO_RTC_INTEGRATION_CONSUL_BINARY`
- `SINCRO_RTC_INTEGRATION_FFMPEG_BINARY`

専用Consulが使うループバックの8500番ポートが空いていることを確認し、Goモジュールのルートで実行する。

```sh
go test -tags=rtcintegration ./internal/rtcintegration/browser -run '^TestFrontendBrowserHarness$' -count=1 -v
```

Go試験が下流4サービス、Consul、Pion、Playwrightの順に起動し、逆順に停止・終了待機する。
Pionは試験ごとの一時ディレクトリへビルドする。Playwrightはルートの
[`playwright.rtc-integration.config.ts`](../../../../playwright.rtc-integration.config.ts)を明示指定して起動する。
`SINCRO_RTC_INTEGRATION_BASE_URL`と`SINCRO_RTC_INTEGRATION_AUDIO_FIXTURE`はGo試験が設定するため、手動設定は不要となる。

現行`/simple-vrm/index.html`で`testdata/rtc-integration-input.wav`をマイク入力として使い、接続、
1往復の利用者テキスト・応答テキスト、`text_ch`、`telop_ch`、非無音の返却音声を確認する。
固定Extractorは最初の非無音PCMだけへ固定データ結果を返す。発話境界、PCM品質、ICE再接続、複数往復は既存の個別試験で確認する。

この試験は通常の`go test ./...`と`npm run gate`には含まれない。
`npm run browser:test`だけでは専用設定の選択やGo側のサービス起動を行わないため、上記のGoコマンドを入口とする。

## エディターでの読み込みと型確認

ルートの`tsconfig.json`はPlaywright設定と試験用環境変数の検証を対象とし、Node型を明示する。
リポジトリのルートで`node_modules/.bin/tsc --project tsconfig.json`を実行して型を確認できる。

VSCodeでの設定読み込みとテスト一覧取得には環境変数を必要としない。リポジトリのルートで次を実行する。

```sh
npm run browser:test -- --config playwright.rtc-integration.config.ts --list
```

必須入力の検査はPlaywrightの`globalSetup`で行い、実行環境が不足する場合はブラウザー起動前に停止する。
VSCodeから試験を直接実行してもPionやConsulは起動しないため、実際の結合試験には上記のGoコマンドを使う。

## 子プロセス

`process.Owner`は`new → running → exited`の単調状態を持つ。`Close`はSIGTERM後も終了しなければ
SIGKILLを送り、バックグラウンド待機処理の終了を待つ。

## 旧名称からの変更

移行計画のGate 3で導入した試験を、現在の用途に合わせて改名した。
旧`-tags=gate3`は`-tags=rtcintegration`、旧`internal/gate3`は`internal/rtcintegration`、
旧`SINCRO_GATE3_*`は`SINCRO_RTC_INTEGRATION_*`へ置き換える。旧名の互換エイリアスは提供しない。
過去の移行記録にあるコマンドを使う場合も、現在の実行手順へ読み替える。
