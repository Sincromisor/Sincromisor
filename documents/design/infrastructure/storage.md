# インフラ: 保存領域

## 要約

- 保存領域は Redis と SeaweedFS を中心に、サービス間の一時状態やファイル保存を支える。
- MinIO は通常導線から外し、SeaweedFS を正本とする。
- 保存領域変更は Docker Compose、環境変数、利用サービスを同時に確認する。

## 対象範囲

- 対象:
    - Redis
    - SeaweedFS
    - 保存領域関連環境変数 / Docker Compose
- 非対象:
    - 各サービスの業務ロジック
    - 旧 MinIO 運用

## 責務

- Redis:
    - 軽量な一時状態やキャッシュ用途を担う。
- SeaweedFS:
    - 音声、ログ、評価成果物などのファイル保存用途を担う。

## 変更時の確認

- 保存領域エンドポイントや認証情報を変える場合は `examples/compose.env` と Docker Compose を同時更新する。
- 保存オブジェクトのスキーマやパスを変える場合は利用サービスの受信処理 / 書き込み処理を同時更新する。
- MinIO 前提の記述が残っていないか確認する。

## 参照

- `documents/design/infrastructure/compose.md`
- `documents/design/archive/legacy-flat/backend_storage.md`
