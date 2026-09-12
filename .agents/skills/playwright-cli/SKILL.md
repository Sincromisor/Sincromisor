---
name: playwright-cli
description: ブラウザーを操作して画面や動作を確認する場合、またはPlaywrightテストを実行・調査する場合に使う。
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*)
---

# ブラウザー操作と確認

`playwright-cli` で必要な画面操作・観測を行う。UIコードを編集するだけの場合には使わない。

## 基本操作

利用可能な `playwright-cli` を使う。見つからない場合は `npx --no-install playwright-cli --version` で既存の導入を確認する。依存追加や全体への導入を、画面確認の前提として自動実行しない。導入が必要なら、依頼範囲と環境の権限に応じて判断する。

```sh
playwright-cli open <確認対象URL>
playwright-cli snapshot
playwright-cli click <snapshotに表示された要素の参照>
playwright-cli snapshot
playwright-cli close
```

入力には `fill <参照> <値>`、キー操作には `press Enter` などを使う。画面遷移などで参照が変わった場合は最新の `snapshot` を取得する。見た目の確認が必要なら `screenshot`、エラーや通信の調査には `console` / `network` を使う。その他のコマンドは `playwright-cli --help` で必要なものだけ確認する。

既存テストの実行・修正が目的なら、ブラウザー操作から始めず [テストの実行と調査](references/playwright-tests.md) を読む。新しいテストは要求結果を確認するために必要な場合に作る。

## 操作と成果物の範囲

- 依頼された画面・操作を対象とし、外部への送信や保存・削除は既に与えられた許可の範囲で行う。コマンド例は操作の許可を意味しない。
- 通常は一時セッションを使う。既存プロファイルへの接続や認証情報の保存は、必要な場合に `playwright-cli --help` で該当コマンドを確認する。終了時は自分のセッションだけを閉じる。
- 画面・カメラ・認証情報を含み得る記録の保存先は [成果物の公開範囲](../../../tasks/README.md#公開成果物と非公開検証原本) に従う。認証状態や未確認の画像をタスクの公開領域へ保存しない。

## 詳細な操作

セッション管理、保存状態、通信の置き換え、追跡・動画記録などは、必要な操作のヘルプを確認して使う。操作例やヘルプに載っているだけでは実行せず、依頼された結果に必要な範囲に絞る。
