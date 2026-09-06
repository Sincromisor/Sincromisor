# コンテナイメージの公開

## 要約

月1回程度、リポジトリのルートから `node scripts/publish-images.mjs publish` を実行する。
スクリプトはGitの現在のコミットを一時展開し、Composeの自作イメージを `ghcr.io/sincromisor` へ公開する。
対象は `linux/amd64`。公開元は `compose.yml` と `examples/compose.env` で決まり、運用中の `.env`、未追跡ファイル、辞書、キャッシュは含めない。

## 初回の認証

Node.js、Git、tar、Docker Engine、Compose、Buildx、GitHub CLIを用意する。
GitHub Packagesの操作権限があるアカウントで認証する。月次公開はDockerの認証だけを使う。
一覧取得・旧パッケージ削除には別途 `gh` の認証が必要である。

```sh
gh auth refresh -h github.com -s read:packages,write:packages,delete:packages
```

個人用アクセストークンを使う場合はclassic形式に `read:packages`、`write:packages`、削除する場合は `delete:packages` を付ける。
トークンを安全な方法で `GH_TOKEN` 環境変数に設定し、同じアカウントでDockerへログインする。
トークンをコマンド引数、文書、リポジトリ内のファイルへ保存しない。

```sh
gh auth token | docker login ghcr.io --username YOUR_GITHUB_LOGIN --password-stdin
node scripts/publish-images.mjs inventory
```

パッケージ削除には対象の管理権限も必要である。新規パッケージはGitHubのパッケージ設定で公開範囲を `public` にする。
スクリプトは送信後に空のDocker認証設定でマニフェストを取得する。非公開ならこの確認が失敗するため、公開設定を変更して `push` を再実行する。
[GitHubの認証と権限](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)と
[削除の制約](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package)を参照する（2026-09-07確認）。

## 月次更新

1. 公開するソースとロックファイルの変更を確認してコミットする。未コミットの変更は公開されない。
2. 対象を確認して公開する。

```sh
node scripts/publish-images.mjs plan
node scripts/publish-images.mjs publish
```

`--pull` で基底イメージを確認し、ビルドキャッシュを再利用する。
`npm ci` と `uv sync --locked` に従うため、これだけで依存パッケージのバージョンは更新されない。
依存更新が必要な月は先に依存宣言とロックを更新する。
自動スケジュール登録は行わず、月次の作業時に実行する。

全イメージのビルドが成功した後、UTC日時とソースコミットを含む履歴タグを全件送信し、その後 `latest` を順次更新する。
各イメージの履歴タグと `latest` のダイジェスト一致を確認する。履歴タグは自動削除しない。
公開処理は稼働中のComposeを停止・再作成しない。導入先への反映は別途 `pull` と `up -d` で行う。

## ビルドと送信を分ける・途中失敗から再開する

```sh
node scripts/publish-images.mjs build
# 表示された履歴タグを指定する。以下は形式の例。
node scripts/publish-images.mjs push 20260907t010203-0123456789ab
```

`push` はローカルに全対象の履歴タグがあること、ソースコミットとアーキテクチャの一致を検証してから送信する。
送信途中で失敗した場合も、同じコミットをチェックアウトした状態で同じ `push` を再実行する。
GHCRに複数パッケージの一括切替はないため、`latest` の更新途中は新旧が混在し得る。
全件成功するまで導入先の更新を開始しない。

## 廃止パッケージの整理

```sh
node scripts/publish-images.mjs inventory
node scripts/publish-images.mjs delete-retired minio sincro-client
```

`inventory` で名前、公開範囲、所属リポジトリ、現行対象かを確認してから、廃止済みの名前だけを指定する。
`delete-retired` は指定したパッケージとその全バージョンを削除する。
現行Composeの対象、所属が不明なもの、他リポジトリのものは拒否し、全指定の検証後に削除を始める。
一部の削除だけ成功して停止した場合は、再度一覧を取得し、残っている名前だけで実行する。
公開パッケージのダウンロード数などによりGitHubが削除を拒否する場合は、エラーを記録し個別に対応する。

現行名の古いバージョンを手動整理する場合、タグがないことだけで削除対象にしない。
複数アーキテクチャのマニフェストや証明情報は、タグなしでも現行イメージから参照され得る。
更新前のバージョンIDを記録し、新規公開の成功と参照関係を確認してから対象IDを限定して削除する。

## 確認方法

```sh
node --test scripts/tests/publish-images.test.mjs
```

外部コマンドの模擬実行で削除保護、ビルド失敗時の停止、送信前のソース一致、公開順序を確認する。
実公開時はスクリプトのダイジェスト確認と匿名取得確認を使う。
