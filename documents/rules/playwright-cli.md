# Playwright CLI利用ルール

## 目的と適用範囲

ブラウザーの操作・画面確認には `playwright-cli` を使い、普段使うChromeとプロファイルを分離する。Playwrightテストの実行・調査も本書を入口とする。UIコードを編集するだけの場合は読み込む必要はない。

## 導入の確認

ルートで`npm ci`を実行し、固定済みCLIを`npm run browser -- <引数>`で使う。グローバル導入は不要。

利用するオプションは `npm run browser -- open --help`、その他の操作は `npm run browser -- --help` と対象コマンドのヘルプで確認する。

## ブラウザーの更新と保護

操作CLIと通常のテストは、OS側で更新するGoogle ChromeのStableチャネルを使う。
Playwrightが指定するChromiumと、システムChromeの更新は別であり、`npm ci`だけではブラウザーを更新できない。
未導入の場合は`npm run browser:install`でChromeを導入する。このコマンドはシステムへ変更を加えるため、
導入済みChromeの更新はOSのパッケージ管理やChromeの更新機能で行う。
Linuxでは`google-chrome --version`で実行ファイルの版を確認する。

テストの共通設定は[`playwright.browser.ts`](../../playwright.browser.ts)に置く。
通常・CSS・RTCのテストは`channel: "chrome"`と`chromiumSandbox: true`を共有する。
ブラウザーの固定バージョン検査や、そのための追加起動は行わない。Chromeのセキュリティ更新はOS側で継続する。
Chromeが未導入、またはサンドボックス付きで起動できない環境では起動に失敗し、`--no-sandbox`で回避しない。
操作CLIでも`--browser=chrome`を使い、設定ファイルや環境変数でサンドボックスを無効化しない。

リポジトリルートの`npm run browser:test:security`で、ページを外部へ接続せずに起動引数を確認する。
Linuxでは`chrome://sandbox`の保護状態も確認する。
専用プロファイルは認証状態を分離するものであり、ブラウザーの更新やサンドボックスの代わりにはならない。

## Chromeの専用プロファイル

CLIでChromeを起動する場合は、専用ディレクトリを `--profile` に指定する。普段使うChromeのユーザーデータディレクトリやプロファイルを指定しない。専用プロファイルはリポジトリの外へ置き、Cookieやログイン状態をGit管理しない。

macOSでの標準保存先は `$HOME/Library/Application Support/PlaywrightProfiles/sincromisor` とする。以下はリポジトリルートで実行する。確認対象のURLがある場合は `about:blank` を置き換える。

```sh
mkdir -p "$HOME/Library/Application Support/PlaywrightProfiles/sincromisor"
npm run browser -- -s=sincromisor open about:blank \
  --browser=chrome \
  --headed \
  --profile="$HOME/Library/Application Support/PlaywrightProfiles/sincromisor"
```

- `--profile` は永続プロファイルの保存先を指定する。初回起動で作成され、次回も同じパスを指定して保存状態を再利用する。Chromeのプロフィール選択画面で事前に追加する必要はない。
- `-s=sincromisor` は操作対象のセッション名であり、プロファイルの保存先ではない。後続の操作にも同じセッション名を付ける。
- 別の作業が使用中のセッションには割り込まない。同時に別のChromeを起動する場合は、セッション名と専用プロファイルの保存先を両方分ける。同じ保存先を複数プロセスから同時に使わない。
- 一時状態での再現確認など、保存状態を使わないことが必要な場合は専用の一時セッションを使う。テストが管理するブラウザーには、この永続プロファイルを持ち込まない。

## 操作と終了

リポジトリルートで実行し、操作対象は直前の `snapshot` で確認する。

```sh
npm run browser -- -s=sincromisor snapshot
npm run browser -- -s=sincromisor click <snapshotに表示された要素の参照>
npm run browser -- -s=sincromisor snapshot
npm run browser -- -s=sincromisor close
```

入力には `fill <参照> <値>`、キー操作には `press Enter` を使う。画面遷移などで要素の参照が変わった場合は `snapshot` を取得し直す。見た目の確認には `screenshot`、エラーや通信の調査には `console` / `requests` を使う。

終了時は自分のセッションだけを閉じる。他の作業に影響する `close-all` / `kill-all` や、プロファイルを消去する `delete-data` を通常の後片付けに使わない。

## 操作の許可と成果物

依頼された画面・操作を対象とし、外部への送信や保存・削除は既に与えられた許可の範囲で行う。コマンド例やヘルプへの掲載は操作の許可を意味しない。既存ブラウザーへの接続、認証状態の書き出し、通信の置き換え、追跡・動画記録は、依頼された結果に必要な場合だけ行う。

画面・カメラ・認証情報を含み得る記録の保存先は [成果物の公開範囲](../../tasks/README.md#公開成果物と非公開検証原本) に従う。認証状態や未確認の画像をタスクの公開領域へ保存しない。

## Playwrightテスト

既存テストの実行・修正が目的なら、ブラウザー操作から始めず [テストの実行と調査](../../.agents/skills/playwright-cli/references/playwright-tests.md) を読む。新しいテストは要求結果の確認に必要な場合だけ作る。

`npm run browser:test`は[`playwright.config.ts`](../../playwright.config.ts)を使う。
通常の画面試験は別途開発サーバーを起動して実行する。CSS試験は`npm run browser:test:css`、
RTC試験は[RTC統合試験の手順](../../sincromisor-server/sincro-rtc/internal/rtcintegration/README.md)から実行する。
いずれも共通のブラウザー保護設定を使い、RTCでもブラウザーの実行ファイルを個別指定しない。

## 公式スキルの更新

`playwright-cli install --skills=agents` で導入する公式スキルと `references/` は、上流の原文資料としてGit管理する。プロジェクト固有の運用は本書に置き、公式スキルの汎用例より本書を優先する。更新時はスキル本文と参照資料をまとめて確認し、リンク先の欠落と利用コマンドの変更を確認する。公式資料の英語表記は原文として保持する。

公式スキルは固定済みCLIより新しい場合がある。追加オプションを利用する前に、対象コマンドのヘルプで対応を確認する。CLI 0.1.22のヘルプには、公式例の `tab-new --isolated-context` と `cookie-delete --domain` は掲載されていない。

## 参照

[Playwrightのブラウザー選択](https://playwright.dev/docs/browsers)、
[サンドボックス設定](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox)
（2026-11-04参照）。システムChromeの利用とサンドボックスの明示的な有効化に適用する。

[Playwright CLI公式ドキュメント](https://github.com/microsoft/playwright-cli)（2026-10-11参照）。本プロジェクトでは名前付きセッションによる操作と専用プロファイルの永続化を採用する。インストール済みCLIの `open --help` で `--browser`、`--headed`、`--profile` の対応を確認した。

[Playwright公式スキル](https://github.com/microsoft/playwright/tree/b4695e3eb2e6736d1a7b1fd255c4e94f78553660/packages/playwright-core/src/tools/skills/playwright-cli)（2026-10-24参照）。スキル本文と参照資料はこのコミットの内容を採用し、リポジトリのMarkdown整形と既存の雛形の整形除外を維持する。
