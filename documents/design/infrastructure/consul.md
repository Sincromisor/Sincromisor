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

## 変更時の確認

- サービス名を変える場合は登録側、探索側、Docker Compose、環境変数を同時更新する。
- 公開用の待受ホスト / ポートを変える場合は RTC 設定とリバースプロキシの影響を確認する。
- 代替処理設定を変える場合は Consul 未起動時の挙動を確認する。

## 参照

- `documents/design/infrastructure/compose.md`
- `documents/design/archive/legacy-flat/service_consul.md`
