# インフラ: Docker Compose

## 要約

- Docker Compose は各ホストのサービス配置を定義する。複数ホスト運用ではホストごとのプロファイルとConsulエージェントを維持する。
- `.env`、Docker Compose サービス、Pion / フロントエンド設定の 3 点を常に整合させる。
- `full` / `rtc` プロファイルはPion版 `sincro-rtc` を起動する。

## ローカル起動の前提

- 手順の入口は[README](../../../README.md#とにかくローカル環境でサーバーを動かす)。`examples/compose.env` をリポジトリのルートの `.env` へコピーし、例示の広告IPv4を必ず編集する。
- イメージ・依存パッケージ・モデルの取得準備と、サービス実行時の接続条件を分ける。認識サービス自身がNeMoのキャッシュを優先して読み、欠損時だけ自動取得する。保存先と初回の権限準備は[モデルキャッシュ](storage.md#モデルキャッシュ)を参照する。
- `sincro` はDify設定不要。フロントの初回既定値は `chat` なので、Difyなしで試す場合は開始前に `sincro` へ変更する。
- `chat` は管理下に配置したDifyとLLMを使う。Difyの配備はこのComposeに含めない。同梱LLMは追加の `chat` プロファイルで別途起動する。ルート `.env` の `SINCRO_PROCESSOR_DIFY_URL` / `SINCRO_PROCESSOR_DIFY_TOKEN` を `compose/text-processor.yml` が環境変数へ渡し、Pythonの `TextProcessorProcessArgument` が読む。
- DifyのURLは `text-processor` コンテナから到達できるホストのLANアドレスや共有ネットワーク上のサービス名とし、APIの `/v1` までを指定する。`127.0.0.1` はコンテナ自身であり、別のDifyへは接続できない。

## プロファイルの選択

`examples/compose.env` は `COMPOSE_PROFILES=full` を設定する。ルートの `.env` に同じ設定を置くと、
通常は `docker compose up -d` だけで全サービスを起動できる。既存の `.env` には必要に応じて追記する。
この変数はCompose自身が読むため、サービスコンテナの環境変数には渡さない。

複数ホスト運用では、そのホストが担当するプロファイルを `.env` に設定する。
一時的な選択変更は `COMPOSE_PROFILES=backend docker compose config --services` のように環境変数を上書きし、
対象を確認してから起動する。`COMPOSE_PROFILES` が空でプロファイルも指定しなければ、起動対象は0件となる。
`--profile` と環境変数の併用時の選択範囲は、起動前に `config --services` で確認する。

## チャット用LLM

`compose/llama-server.yml` は `chat` 専用で、`full` / `backend` / `rtc` 単独の起動範囲を増やさない。
`full,chat` を選ぶと既存サービスにLLMを加える。現在のテキスト処理入口はDifyのままである。
内部待受は `0.0.0.0:8080`、OpenAI互換URLは `http://llama-server:8080/v1`、
モデル識別子は `gemma-4-E2B-it`。ホストへポートを公開しない。

公式CUDA 13イメージのダイジェストと推論設定の正本は `examples/compose.env` と `compose/llama-server.yml`。
NVIDIA GPUを1台予約し、`--n-gpu-layers 99` でモデル全層を配置する。CPU側は6スレッド、4096トークン・1スロットとする。音声認識・音声合成とGPUメモリーを共有するため、同時稼働時の容量を確保する。ツール呼出しにはGGUF内のJinjaテンプレートを使い、
`--reasoning off` で思考生成を無効にする。`SINCRO_LLAMA_*` はルート `.env` からコマンドとマウントへ渡す。
イメージ内の `curl --fail` が `/health` を確認し、ロード中の503とロード済みの200を区別する。

モデルの取得は[README](../../../README.md#gemma-4-e2bを準備する)、固定リビジョンと保存条件は
[チャット用GGUF](storage.md#チャット用gguf)を参照する。通常起動時のモデル取得は行わない。

## 管理者用Mastra

`agent-server` は `chat` プロファイルでllama-serverを待って起動する。
Mastra APIとStudio Editorを同じ本番コンテナに置き、内部4111をホストの `127.0.0.1:4111` だけへ公開する。
管理者トークンとLLM設定を `.env` から渡し、設定不足はサービス起動で拒否する。
未選択のchat設定が空でも `full` / `backend` / `rtc` の構成確認は妨げない。
死活確認は認証付きAPIを使う。認証・Editor・HTTP契約は[AgentServer](../backend/services/agent-server.md)を参照する。

## コンテナの依存導入

配布イメージのビルドとGHCRへの月次更新は[コンテナイメージの公開](image-publishing.md)を参照する。

フロントエンドは `npm ci`、Pythonサービスは `uv sync --locked` で管理済みロックに従う。
依存宣言とロックが不整合ならビルドを失敗させる。Pythonはソース配置前に
`--no-install-workspace` で外部依存だけを導入し、配置後に同じグループのワークスペースを導入する。
起動時は `uv run --no-sync` でビルド済み環境を使う。
依存を変更するときは開発環境で `npm install` または `uv lock` を実行し、
依存宣言とロックの差分を一緒に確認・コミットしてから再ビルドする。

音声認識モデルの指定は `SINCRO_RECOGNIZER_MODEL=nemo` のみ対応する。
以前の `nue` 指定は非互換となり、ビルドでは依存導入前に拒否する。配布イメージも `nemo` を選ぶ。
共通の `service-initializer` は使わない。フロントとテキスト処理はモデル準備やS3を待たず、
認識と音声合成はS3のバケット・認証を準備する `s3-bootstrap` の正常終了を待つ。

## NeMoのGPU基盤

NeMoのビルド・実行段階は `nvidia/cuda:13.0.3-cudnn-runtime-ubuntu24.04` を使う。
現在のロックに含まれるPyTorchのCUDA 13系ライブラリに合わせた構成である。
PyTorchのTriton演算が実行時にC拡張を生成するため、実行段階にも `gcc` と `python3-dev` を導入する。
ホストにはNVIDIA Container ToolkitとGPU対応ドライバーが必要となる。
[NVIDIA互換表](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html)
（2026-09-06確認）ではCUDA 13系の最低ドライバー系統は580である。
PTXや新機能には追加条件があるため、最低値だけで動作を保証せず、導入先でGPU認識を確認する。

## ブラウザの公開先

- `compose/frontend.yml` はHTTPをホストの `8086` からコンテナの `80` へ公開する。同じPCでは `http://localhost:8086`、LANの別端末からのHTTP公開先は `http://<サーバーのLANアドレス>:8086` となる。
- マイク・カメラには安全な接続条件とブラウザの利用許可が必要である。同じPCの `localhost` は通常HTTPでも利用できるが、LANの別端末では管理下のHTTPS終端とブラウザが信頼する証明書を準備し、そのHTTPSのURLを使う。
- 現在の `configs/Caddyfile` は `:80` だけでHTTPS・証明書は未設定。未使用の `8443:443` は公開しない。HTTPSをコンテナで終端する場合は、証明書・待受設定と公開ポートを併せて追加する。

## 公開ポートの選択

標準の `compose.yml` は `8086/TCP` とメディアUDPだけをホストへ公開する。
Redis、S3、VOICEVOX、下流4サービス、ConsulはCompose内部で通信し、`expose` の追加も不要である。
単一ホストではConsul広告先を空欄とし、サービスの `PUBLIC_BIND_HOST` とPionの登録先はサンプルのサービス名を使う。
コンテナ内の待受アドレスは `0.0.0.0` のままとする。

追加ファイルはルートの `compose.yml` に重ねる。各サービスの既存プロファイルと依存関係を引き継ぐ。

| 追加ファイル              | ホストへの公開                                           | 用途                                                         |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `compose/distributed.yml` | 管理IPv4のTCP 8001〜8005、8300、TCP/UDP 8301・8311〜8318 | 別ホストのRTCから下流APIへ接続し、Consulメンバー間で通信する |
| `compose/management.yml`  | `127.0.0.1:8001/TCP`、`127.0.0.1:8500/TCP`               | ホスト上のHTTPS終端・RTC保守確認・Consul管理UI/API           |

分散配置では、各ホストの `.env` に以下を設定する。`COMPOSE_FILE` の区切りはLinuxの `:` である。
管理接続が不要なら末尾の `:compose/management.yml` を省く。

```dotenv
COMPOSE_FILE=compose.yml:compose/distributed.yml:compose/management.yml
```

- `COMPOSE_PROFILES` はホストの担当に合わせて `full`、`backend`、`rtc` などを選ぶ。追加ファイルはサービスの起動範囲を増やさない。
- `SINCRO_CONSUL_PUBLISH_HOST` はそのホストの管理IPv4にする。分散用ファイルは未設定・空欄を拒否する。全インターフェースやループバックではなく、相互到達できる管理IPを使う。
- `SINCRO_CONSUL_ADVERTISE_ADDR` も管理IPv4にし、`SINCRO_CONSUL_SERVER_HOST` は既存サーバーの到達先を指定する。
- 下流4サービスの `SINCRO_*_PUBLIC_BIND_HOST` は、それらを配置したホストの管理IPv4にする。TCP 8002〜8005は別ホストのRTCが直接使うため、内部サービス名に戻さない。
- 別ホストから参照されるPionの `SINCRO_PION_SERVICE_BIND_HOST` は管理IPv4にする。ブラウザ向けの `SINCRO_PION_PUBLIC_IPV4` は別に設定する。
- 音声合成と同居するRedis・S3・VOICEVOXは公開しない。ConsulのWAN federation、HTTPS/gRPC、ホスト向けDNSとS3メトリクスも公開しない。

### 既存環境の移行

これはホストへの公開範囲を変更する破壊的変更である。JSONやWebSocketの通信形式、コンテナ内ポートは変更しない。
分散配置では再作成前に、下流側とRTC側の両方で追加ファイルの選択と管理IPを設定する。
単一ホストへ移行する場合は、Consul広告先を空欄、サービス登録先を内部サービス名へ戻してから公開を削除する。
サンプルのメディアUDPは3478から3479へ変更したが、既存 `.env` の指定値を自動変更しない。

リポジトリのルートで `docker compose config --services` と公開ポートを確認する。
`-f` を明示すると `.env` の `COMPOSE_FILE` による選択を置き換えるため、イメージ復旧などの一時ファイルを追加する際も必要な追加ファイルをすべて列挙する。
設定全体の出力には秘密情報が含まれるため、そのまま公開ログへ保存しない。

反映は会話終了後に `docker compose up -d --no-build --pull never` で再作成する。`restart` だけでは公開設定が変わらない。
VPSなどのRTC専用ホストではプロファイルを `rtc` とし、ローカル・リモート両RTCの登録、下流4サービスへの到達、会話を確認する。
管理APIは追加ファイル使用時もループバック限定となるため、遠隔保守はSSH経由で行う。
SeaweedFS内部サービスのネットワーク分離と保存ボリュームは維持する。

## 共有橋渡しネットワーク

ルート `compose.yml` の `sincromisor-net` は
`${SINCRO_COMPOSE_NETWORK_SUBNET}` をIPAM サブネットとして使う。既定値は
`examples/compose.env` の `172.28.0.0/16` である。

通常のPion サービスは `sincro-rtc` とし、コンテナ IPv4はDockerが動的に割り当てる。
`--media-udp-port ${SINCRO_PION_MEDIA_UDP_PORT}` と `--interface ${SINCRO_PION_INTERFACE}` はコンテナ内の
共有UDP多重化処理待受先を選び、`--service-bind-host ${SINCRO_PION_SERVICE_BIND_HOST}` はConsul登録アドレスを決める。
ローカル Docker Composeの既定サービスの待受ホストは`sincro-rtc`である。別ホスト Consulを使う場合はConsulから死活確認可能な
Pion ホストのVPN アドレスを指定する。ブラウザへ広告するIPv4は別値とする。`SINCRO_PION_PUBLIC_IPV4` はブラウザから到達可能なホストのIPv4を指し、閉じたLANではLANアドレスを使う。インターネット上の公開IPを必須にしない。

標準構成のPionは `${SINCRO_PION_MEDIA_UDP_PORT}`（サンプルは3479）をホスト・コンテナ同値のUDPポートとして公開する。
TCP 8001は内部待受のみとし、ブラウザのHTTP通信はフロントのCaddyから転送する。
`SINCRO_PION_PUBLIC_IPV4`、`SINCRO_PION_STUN`、`SINCRO_RTC_MAX_SESSIONS`、
`SINCRO_PION_FFMPEG_PATH`はPion コマンドへ直接渡す。

通常運用は `.env` の `COMPOSE_PROFILES` に `full` または `rtc` を設定してPionを起動する。Pionは同じComposeの
`consul-agent-rtc` のHTTP 8500を使い、`SINCRO_PION_SERVICE_BIND_HOST`をConsul サービスアドレスとして登録する。
`rtc`は新しいConsulサーバーを起動せず、`SINCRO_CONSUL_SERVER_HOST:8301`へ参加する。`full`は既存のローカルサーバーを維持する。
エージェントのHTTP 8500はホストへ公開せず、Pionは`depends_on`で`consul-agent-rtc`の死活確認成功後に起動し、
`/health/ready` を10秒間隔・5秒時間切れで監視する。管理ネットワークでの広告先とポートは[Consul設計](consul.md#複数ホストのエージェント)に従う。

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
