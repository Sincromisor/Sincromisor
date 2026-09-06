# インフラ: Consul

## 要約

- Consul はバックエンドマイクロサービスのサービス発見に使う。
- Goパイプライン調停器と Pion RTC は処理担当サービスを Consul から解決し、未解決時は代替処理設定を使う。
- サービス名や公開用の待受設定を変える場合は Docker Compose と設定クラスを同時確認する。

## 対象範囲

- 対象:
    - Consul エージェント
    - サービス登録
    - 処理担当発見
    - 代替処理ホスト / ポート
- 非対象:
    - Consul クラスタ運用の詳細
    - 下流サービスの内部処理

## 責務

- 各サービスは起動時に Consul へ登録する。
- Pion RTC は `RTCSignalingServer` として、`SINCRO_PION_CONSUL_HTTP_HOST` / `SINCRO_PION_CONSUL_HTTP_PORT`のHTTP エンドポイントへ、
  `SINCRO_PION_SERVICE_BIND_HOST`で解決したアドレスと`/health/ready` 確認（10秒間隔、5秒時間切れ、重大後10分登録解除）を登録する。`draining`開始直後に解除する。
  Pionはホストをまたぐゴシップ用エージェントを必要としない。
- Goパイプライン調停器は SpeechExtractor / SpeechRecognizer / TextProcessor / VoiceSynthesizer の到達先を解決する。
- Consul が使えない場合でも代替処理ホスト / ポートで開発継続できるようにする。

## 長期停止後の起動

Consulは保存データの最終稼働時刻が `server_rejoin_age_max` を超えると起動を拒否する。
標準値は `168h`（7日）で、古いサーバーがクラスタへ再参加することを防ぐ仕組みである。
仕様は[Consul公式設定資料](https://developer.hashicorp.com/consul/docs/reference/agent/configuration-file/general)を2026-09-06に確認した。

このComposeは `-bootstrap-expect=1` の単一サーバー構成であるため、開発休止後も保存データを使って再開できるよう、
`compose/consul-server.yml` で停止許容期間の既定値を `87600h`（365日換算で10年）へ延長する。
`.env` の `SINCRO_CONSUL_SERVER_REJOIN_AGE_MAX` をConsulの `-hcl` 引数へ渡す。未設定・空欄でも同じ既定値を使う。
Pythonの設定クラスは経由しない。データボリューム、サービス登録、KVは削除しない。
複数サーバー構成へ変更する場合は、この値を標準の `168h` へ戻してクラスタの復旧手順を設計する。

既存環境への反映はリポジトリのルートで行う。

```sh
docker compose --profile full up -d --no-deps sincro-consul-server
docker compose --profile full exec sincro-consul-server consul operator raft list-peers
```

`restart` だけでは変更後の起動引数が反映されないため、`up -d` で再作成する。
起動できない場合は `docker compose --profile full logs --tail=100 sincro-consul-server` で原因を確認する。
設定した期間を超える停止には引き続き起動保護が働く。認証や証明書など別原因の期限切れはこの設定では解消しない。
他の保存領域まで失う `docker compose down -v` を復旧手段にしない。

## 変更時の確認

- サービス名を変える場合は登録側、探索側、Docker Compose、環境変数を同時更新する。
- 公開用の待受ホスト / ポートを変える場合は RTC 設定とリバースプロキシの影響を確認する。
- 代替処理設定を変える場合は Consul 未起動時の挙動を確認する。

## 参照

- `documents/design/infrastructure/compose.md`
- `documents/design/archive/legacy-flat/service_consul.md`
