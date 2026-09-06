# インフラ: Docker Compose

## 要約

- Docker Compose は Sincromisor のローカル/単一ホスト実行の正本である。
- `.env`、Docker Compose サービス、Pion / フロントエンド設定の 3 点を常に整合させる。
- `full` / `rtc` プロファイルはPion版 `sincro-rtc` を起動する。

## ローカル起動の前提

- 手順の入口は[README](../../../README.md#とにかくローカル環境でサーバーを動かす)。`examples/compose.env` をリポジトリのルートの `.env` へコピーし、例示の広告IPv4を必ず編集する。
- イメージ・依存パッケージ・モデルの取得準備と、サービス実行時の接続条件を分ける。初期化処理は `hf download` で音声認識モデルを取得して `volumes/sincro-cache` へ保存する。起動時にも取得コマンドが走るため、完全オフライン導入・起動は未検証である。
- `sincro` はDify設定不要。フロントの初回既定値は `chat` なので、Difyなしで試す場合は開始前に `sincro` へ変更する。
- `chat` は管理下に配置したDifyとLLMを使う。Dify・LLMの配備はこのComposeに含めない。ルート `.env` の `SINCRO_PROCESSOR_DIFY_URL` / `SINCRO_PROCESSOR_DIFY_TOKEN` を `compose/text-processor.yml` が環境変数へ渡し、Pythonの `TextProcessorProcessArgument` が読む。
- DifyのURLは `text-processor` コンテナから到達できるホストのLANアドレスや共有ネットワーク上のサービス名とし、APIの `/v1` までを指定する。`127.0.0.1` はコンテナ自身であり、別のDifyへは接続できない。

## コンテナの依存導入

フロントエンドは `npm ci`、Pythonサービスは `uv sync --locked` で管理済みロックに従う。
依存宣言とロックが不整合ならビルドを失敗させる。Pythonはソース配置前に
`--no-install-workspace` で外部依存だけを導入し、配置後に同じグループのワークスペースを導入する。
起動時は `uv run --no-sync` でビルド済み環境を使う。
依存を変更するときは開発環境で `npm install` または `uv lock` を実行し、
依存宣言とロックの差分を一緒に確認・コミットしてから再ビルドする。

## ブラウザの公開先

- `compose/frontend.yml` はHTTPをホストの `8086` からコンテナの `80` へ公開する。同じPCでは `http://localhost:8086`、LANの別端末からのHTTP公開先は `http://<サーバーのLANアドレス>:8086` となる。
- マイク・カメラには安全な接続条件とブラウザの利用許可が必要である。同じPCの `localhost` は通常HTTPでも利用できるが、LANの別端末では管理下のHTTPS終端とブラウザが信頼する証明書を準備し、そのHTTPSのURLを使う。
- `8443:443` のTCP/UDPも公開するが、現在の `configs/Caddyfile` は `:80` だけでHTTPS・証明書は未設定。ポート公開だけではHTTPSを提供しない。

## 共有橋渡しネットワーク

ルート `compose.yml` の `sincromisor-net` は
`${SINCRO_COMPOSE_NETWORK_SUBNET}` をIPAM サブネットとして使う。既定値は
`examples/compose.env` の `172.28.0.0/16` である。

通常のPion サービスは `sincro-rtc` とし、コンテナ IPv4はDockerが動的に割り当てる。
`--media-udp-port ${SINCRO_PION_MEDIA_UDP_PORT}` と `--interface ${SINCRO_PION_INTERFACE}` はコンテナ内の
共有UDP多重化処理待受先を選び、`--service-bind-host ${SINCRO_PION_SERVICE_BIND_HOST}` はConsul登録アドレスを決める。
ローカル Docker Composeの既定サービスの待受ホストは`sincro-rtc`である。別ホスト Consulを使う場合はConsulから死活確認可能な
Pion ホストのVPN アドレスを指定する。ブラウザへ広告するIPv4は別値とする。`SINCRO_PION_PUBLIC_IPV4` はブラウザから到達可能なホストのIPv4を指し、閉じたLANではLANアドレスを使う。インターネット上の公開IPを必須にしない。

Pionは固定TCP 8001を公開し、
`${SINCRO_PION_MEDIA_UDP_PORT}` をホスト・コンテナ同値のUDP ポートとして公開する。
`SINCRO_PION_PUBLIC_IPV4`、`SINCRO_PION_STUN`、`SINCRO_RTC_MAX_SESSIONS`、
`SINCRO_PION_FFMPEG_PATH`はPion コマンドへ直接渡す。

通常運用は `--profile full` または `--profile rtc` でPionを起動する。Pion サービスは
`SINCRO_PION_CONSUL_HTTP_HOST` / `SINCRO_PION_CONSUL_HTTP_PORT` のHTTP エンドポイントを直接使い、
`SINCRO_PION_SERVICE_BIND_HOST`をConsul サービスアドレスとして登録する。Pion専用のローカルのゴシップ用エージェントは起動しない。
ローカル Docker Composeでは既存の`sincro-consul-server`を指定し、別ホスト ConsulではVPS コンテナから到達可能なHTTP アドレスと、
Consul サーバーがPionへ死活確認できるVPN アドレスをそれぞれ指定する。Pionは`depends_on`で`sincro-consul-server`の
死活確認成功後に起動し、`/health/ready` を10秒間隔・5秒時間切れで監視する。

`SINCRO_PION_STUN` のサンプルは外部STUNを指定する。閉じたLANで直接UDP通信できる場合は空指定にできる。STUNを空にしても広告IPv4とメディアUDPポートへの到達性は必要であり、STUNだけでNATやファイアウォールの制約は解決しない。現行はIPv4・UDPでの直接接続が前提でTURNは未対応。詳細は[RTC運用方針](../../migration/pion/rollout-and-operations.md)を参照する。

既存Docker ネットワークとサブネットが重複する環境では、`SINCRO_COMPOSE_NETWORK_SUBNET`だけを未使用サブネットへ変更する。

## 対象範囲

- 対象:
    - `compose.yml`
    - `compose/*.yml`
    - `examples/compose.env`
    - サービスプロファイル / 環境変数受け渡し
- 非対象:
    - 個別サービス内部実装
    - 本番処理の組み立ての詳細

## 責務

- サービスコンテナのビルド / 画像 / コマンド / 死活確認を定義する。
- 環境変数をサービスへ注入する。
- Consul、Redis、SeaweedFS などの周辺サービスを接続する。
- プロファイルごとの起動単位を定義する。

## 変更時の確認

- 新しい環境変数を追加したら `examples/compose.env`、Docker Composeの環境変数設定、設定クラスを同時更新する。
- Pion サービスはコンテナ IPv4を設定せず、Dockerの動的割当とインターフェース選択を使う。
- サービス名やポートを変える場合は Consul、代替処理設定、契約を確認する。
- 下流サービスを追加/削除する場合は WebSocket 契約を確認する。
- フロントエンド / バックエンドの片側だけで完結する変更にしない。

## 参照

- `documents/design/infrastructure/consul.md`
- `documents/design/infrastructure/storage.md`
- `documents/design/archive/legacy-flat/service_compose.md`
