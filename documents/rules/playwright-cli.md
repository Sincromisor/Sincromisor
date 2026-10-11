# Playwright CLI利用ルール

## 目的と適用範囲

ブラウザーの操作・画面確認には `playwright-cli` を使い、普段使うChromeとプロファイルを分離する。Playwrightテストの実行・調査も本書を入口とする。UIコードを編集するだけの場合は読み込む必要はない。

## 導入の確認

ルートで`npm ci`を実行し、固定済みCLIを`npm run browser -- <引数>`で使う。グローバル導入は不要。

利用するオプションは `npm run browser -- open --help`、その他の操作は `npm run browser -- --help` と対象コマンドのヘルプで確認する。

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

## 公式スキルの更新

`playwright-cli install --skills=agents` で導入する公式スキルと `references/` は、上流の原文資料としてGit管理する。プロジェクト固有の運用は本書に置き、公式スキルの汎用例より本書を優先する。更新時はスキル本文と参照資料をまとめて確認し、リンク先の欠落と利用コマンドの変更を確認する。公式資料の英語表記は原文として保持する。

## 参照

[Playwright CLI公式ドキュメント](https://github.com/microsoft/playwright-cli)（2026-10-11参照）。本プロジェクトでは名前付きセッションによる操作と専用プロファイルの永続化を採用する。インストール済みCLIの `open --help` で `--browser`、`--headed`、`--profile` の対応を確認した。
