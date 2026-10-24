# MinIOの残存依存を削除する

## 背景 / 目的

ユーザーの利用方針によりMinIOは利用できない。標準S3はSeaweedFSへ移行済みだが、旧Compose・Docker定義と音声合成の再実行用Compose 2件がMinIOに依存しているため削除する。

## 完了条件（受け入れ条件）

- [x] `compose/minio.yml`と `Docker/minio/`を削除し、実行可能な構成・依存宣言にMinIOが残っていない。
- [x] 音声合成・逐次再生の検証用Compose 2件をSeaweedFSへ置き換え、既存の接続先・認証を使ってS3の保存・取得が成功し、不正なキーは拒否される。
- [x] 現在設計と公開手順・テスト用固定データを同期し、過去の実施記録と保存済みデータを保持する。
- [x] 標準構成と検証用Composeの構文、対象テスト、Markdown整形、タスク整合性を確認する。

## 設計判断

検証用S3は標準構成と同じSeaweedFS 4.48を単一プロセスで起動し、接続先 `s3:9000`と使い捨て認証値を維持する。既存のHTTP死活確認を再利用し、利用側は準備完了を待つ。標準構成や公開通信契約は変更しない。

## スコープ境界

旧定義、再実行用Compose、現在設計、公開処理の例・固定データが対象。過去タスクの記録・数値証跡は書き換えない。既存MinIOの保存データ、イメージ、コンテナ、ボリュームの削除・移行は含めない。`volumes/minio`のGit除外は誤公開防止のため維持する。

## 実装方針

`compose/minio.yml`と `Docker/minio/`を削除する。`task-261018200818-voicevox-streaming-engine`と `task-261018204902-streaming-conversation-audio`の `artifacts/compose.verify.yml`はS3だけ置き換える。公開処理の廃止パッケージ例・固定データには汎用名を使う。

## テスト

- MinIO参照を分類し、実行可能な構成と依存宣言に残存がないことを検索する。
- サンプル環境で標準構成と検証用Compose 2件の `config --quiet`を確認する。
- 隔離したS3だけを起動し、署名付きのバケット作成・オブジェクト保存・取得と不正キーの403応答を確認する。
- `node --test scripts/tests/publish-images.test.mjs`、変更MarkdownのPrettier、タスク索引・整合性検査を実行する。

## ドキュメント同期の要否

`documents/design/index.md`、`infrastructure/compose.md`、`storage.md`、`logging.md`、`image-publishing.md`を同期する。旧MinIO構成は選択不能になる。現行サービスの通信契約・設定キー・保存方式は変更しない。

## 実施結果

旧ComposeとDocker定義を削除し、検証用Compose 2件をSeaweedFS 4.48へ置き換えた。接続先 `s3:9000`と認証値を維持し、既存のHTTP死活確認と準備完了待ちを追加した。公開処理の例・固定データと設計を同期した。残るMinIO参照は、廃止の説明、過去の作業記録・証跡、保存データのGit除外だけである。Python・Node.js・Goの依存宣言とロックにもMinIO依存はなかった。

- 標準Composeは全プロファイル、音声合成の検証用Composeは `verify`、逐次再生の検証用Composeは `full`を指定し、`examples/compose.env`で `config --quiet`に合格した。
- 検証用S3定義2件の一致、利用側の準備完了待ち、旧定義の削除をアサーションで確認した。
- 音声合成の検証用Composeの `s3`だけを専用プロジェクトで実起動し、正常起動・死活確認・署名付きバケット作成・保存・取得に合格した。不正な署名は403で拒否された。
- `node --test scripts/tests/publish-images.test.mjs`は5件合格した。初回はサンドボックス内の子プロセス起動が `EPERM`になったため、同じテストを制約外で再実行した。
- 対象JavaScript 2件のBiome lint、変更MarkdownのPrettier、相対リンクの存在、文書・コメントを点検した。任意のBiome checkは既存の2スペース書式と標準設定の不一致で失敗したため、一括再整形は行わずlintを確認した。
- `tasks:index:check`と `tasks:check`に合格した（577タスク）。
- 音声合成・WebRTC全体の結合確認は再実行していない。変更したS3境界だけを実確認し、以前の性能測定値を今回の測定として扱わない。

### 検証用資源

Docker接続先とビルダーはともに `default`。開始時・終了時ともコンテナ0、イメージ78件・109GB、ビルドキャッシュ130.9GB、空き容量116GiBだった。SeaweedFS 4.48の取得は既存イメージと同一の `sha256:4e61d15fd35994cb1e43e1e553dff106794841fd9a99ade2fc8c8bfce4d7872d`で、通常開発用の版指定タグを追加しただけである。標準構成も使うためタグは保持する。新規ビルドとキャッシュ増加はない。

専用プロジェクト `minio-cleanup-261024190209`のS3コンテナ1件とネットワーク1件を作成した。S3データはtmpfsで、確認後に同プロジェクトだけを `down`し、コンテナ・ネットワークの残存がないことを確認した。既存イメージの実体、ボリューム、ユーザーの未追跡ファイルは変更していない。

起動オプションと環境変数の根拠はSeaweedFS 4.48の公式実装（[server.go](https://github.com/seaweedfs/seaweedfs/blob/4.48/weed/command/server.go)、[auth_credentials.go](https://github.com/seaweedfs/seaweedfs/blob/4.48/weed/s3api/auth_credentials.go)）を確認した。
