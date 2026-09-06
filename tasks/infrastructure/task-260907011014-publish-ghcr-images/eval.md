# 評価: task-260907011014-publish-ghcr-images

## 判定

PASS

## 根拠

- `scripts/publish-images.mjs` は、コミット済みの Compose 構成から自作 9 イメージだけを選び、全ビルド完了後に履歴タグを送信し、続いて `latest` を更新する。各ダイジェストの一致と、空の Docker 認証設定を使う匿名マニフェスト取得を確認する。
- 削除は明示指定名、現行対象外、`Sincromisor/Sincromisor` 所属を全件検証してから実行する。更新前の ID・ダイジェスト、タグなし、新しい `latest` のマニフェスト参照外も確認しており、旧 `minio` と `sincro-client` の 5 版、および現行名の更新前 52 版を削除した。
- 公開結果は [published-images.json](artifacts/published-images.json)、更新前後の一覧は [ghcr-before.json](artifacts/ghcr-before.json) と [ghcr-after.json](artifacts/ghcr-after.json) に記録されている。最終確認では公開パッケージ 9 件・27 版、更新前 57 ID の不在、`latest` と履歴タグの一致、9 件の匿名取得成功を確認した。
- [コンテナイメージの公開手順](../../../documents/design/infrastructure/image-publishing.md) は認証、月次実行、途中失敗からの再送、廃止パッケージの削除手順を同期している。模擬 CLI 試験は制約外で成功し、削除保護、ビルド失敗時の停止、送信順、匿名取得失敗時の停止を確認した。評価環境内の `node --test` は子プロセス作成の `EPERM` により失敗するが、実装の失敗ではない。

## 残課題

- なし
