# Infrastructure: Storage

## Summary

- Storage は Redis と SeaweedFS を中心に、サービス間の一時状態やファイル保存を支える。
- MinIO は通常導線から外し、SeaweedFS を正本とする。
- storage 変更は compose、env、利用サービスを同時に確認する。

## Scope

- 対象:
    - Redis
    - SeaweedFS
    - storage 関連 env / compose
- 非対象:
    - 各サービスの業務ロジック
    - 旧 MinIO 運用

## Responsibilities

- Redis:
    - 軽量な一時状態や cache 用途を担う。
- SeaweedFS:
    - 音声、ログ、評価 artifact などのファイル保存用途を担う。

## Change Checklist

- storage endpoint や credential を変える場合は `examples/compose.env` と compose を同時更新する。
- 保存 object の schema や path を変える場合は利用 service の reader / writer を同時更新する。
- MinIO 前提の記述が残っていないか確認する。

## References

- `documents/design/infrastructure/compose.md`
- `documents/design/archive/legacy-flat/backend_storage.md`
