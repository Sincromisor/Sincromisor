# Infrastructure: Docker Compose

## Summary

- Docker Compose は Sincromisor のローカル/単一ホスト実行の正本である。
- `.env`、compose service、Python / frontend 設定の 3 点を常に整合させる。
- profile により full / rtc などの起動対象を切り替える。

## Scope

- 対象:
    - `compose.yml`
    - `compose/*.yml`
    - `examples/compose.env`
    - service profile / env wiring
- 非対象:
    - 個別サービス内部実装
    - 本番 orchestration の詳細

## Responsibilities

- service container の build / image / command / healthcheck を定義する。
- env をサービスへ注入する。
- Consul、Redis、SeaweedFS などの周辺サービスを接続する。
- profile ごとの起動単位を定義する。

## Change Checklist

- 新しい env を追加したら `examples/compose.env`、compose environment、設定クラスを同時更新する。
- service 名や port を変える場合は Consul、fallback 設定、contracts を確認する。
- downstream service を追加/削除する場合は AudioBroker と WebSocket contract を確認する。
- frontend / backend の片側だけで完結する変更にしない。

## References

- `documents/design/infrastructure/consul.md`
- `documents/design/infrastructure/storage.md`
- `documents/design/archive/legacy-flat/service_compose.md`
