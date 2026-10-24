# ローカル開発の手順

## 目的

ソースを変更する開発者向けに、依存の導入、画面編集、確認コマンドを案内する。
利用の開始は[README](../../../README.md)、複数ホストへの配置は[利用者向けガイド](../../guides/network-deployment.md)を参照する。

## 開発ツールを用意する

Node.jsとnpmの採用版はルートの `.node-version`と `package.json`に従う。
リポジトリルートで次を実行する。AgentServerの依存管理は別である。

```sh
npm run check:runtime
npm ci
```

## 画面を編集する

リポジトリルートで開発サーバーを起動し、表示されたURLを開く。

```sh
npm run dev
```

ViteにはAPIプロキシがないため、このコマンドだけでは会話用APIやバックエンドは起動しない。
会話確認用のサーバー準備は[README](../../../README.md#ローカル環境でサーバーを動かす)に従う。
フロント専用イメージとRTC同梱フロントは別の成果物である。変更した画面を確認する場合は、利用する側の成果物を更新する。

## 変更を確認する

リポジトリルートの `npm run build`、`npm test`、`npm run check`、`npm run format`を使う。
変更に応じた確認範囲とMarkdownの整形は[タスク管理](../../../tasks/README.md#確認コマンド)に従う。

ブラウザー操作は `npm run browser -- <引数>`を使う。CLIのグローバル導入は不要。
自動テスト用Chromiumは必要時だけ `npm run browser:install`で取得し、`npm run browser:test -- <引数>`で使う。
実機用Chromeと操作手順は[Playwright CLI利用ルール](../../rules/playwright-cli.md)を参照する。

## 変更時の確認

ルートのnpmスクリプト、ViteのAPI転送設定、フロントのビルド方法を変更した場合は本書も照合する。
記録には[成果物の公開範囲](../../../tasks/README.md#公開成果物と非公開検証原本)を適用する。
