# ブラウザーテストの固定版検査と実行ファイル指定を廃止する

## 背景 / 目的

固定バージョンの比較と、その番号を複製したテスト・運用文書の保守負担をなくす。
ユーザーと合意した方針に従い、Chromeの更新はOS側へ任せ、テスト側はシステムChromeの選択とサンドボックスの有効化を担当する。

## 完了条件

- [x] 固定版の下限判定、そのためのブラウザー追加起動、専用の単体試験を削除する。
- [x] 通常・CSS・RTCでシステムChromeとサンドボックスの共通設定を使う。
- [x] RTCの任意実行ファイル指定をGo側の入力・検査・受け渡しから削除し、既存試験を同期する。
- [x] 運用文書の固定番号を削除し、Chromeの更新継続と廃止する環境変数の移行を案内する。
- [x] サンドボックスの実効状態、CSS回帰試験、RTCの入力検査とコンパイル、型・静的検査を確認する。

## 変更範囲と判断

`playwright.browser.ts`には`channel: "chrome"`と`chromiumSandbox: true`の共通設定だけを残す。
サンドボックスの確認は既存の`npm run browser:test:security`を使い、RTCの必須入力検査は保持する。
旧`SINCRO_RTC_INTEGRATION_CHROMIUM_BINARY`を廃止し、Go側はブラウザーの選択と起動をPlaywrightへ委ねる。
古い版の自動拒否は行わないため、更新責務をブラウザー運用規約に明記する。
通信契約と製品の動作は変更しない。過去の完了タスクは当時の作業記録として保持する。

## 確認方法

- `npm run browser:test:security`とRTC設定を使った同じ試験で、実プロセスのサンドボックスを確認する。
- `npm run browser:test:css`で開発・本番ページの既存試験を実行する。
- Goモジュールで`go test ./internal/rtcintegration/harnessenv`、`go vet ./internal/rtcintegration/harnessenv`、`go test -tags=rtcintegration ./internal/rtcintegration/browser -run '^$'`を実行する。
- `node_modules/.bin/tsc --project tsconfig.json`、RTCテスト一覧取得、変更ファイルの整形、相対リンク、タスク管理を確認する。

## 文書同期

[ブラウザー運用規約](../../../documents/rules/playwright-cli.md)と
[RTC統合試験手順](../../../sincromisor-server/sincro-rtc/internal/rtcintegration/README.md)を更新する。

## 確認結果

- 通常・RTCの各設定で、サンドボックスの実効状態を確認する試験に成功した。
- CSS回帰試験12件と、試験内での本番ビルドに成功した。
- RTC入力検査のGo試験・静的検査と、RTCブラウザー試験のコンパイルに成功した。
- TypeScriptの型確認、RTCのテスト一覧取得、変更ファイルの整形と相対リンクを確認した。
- 固定版の判定と任意実行ファイル指定の参照が、現行コードからなくなったことを確認した。
