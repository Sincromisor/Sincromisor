# ローカル開発の手順

## 要約

バックエンドを含む会話確認にはDocker Compose、画面の編集にはルートの `npm run dev`を使う。
単一ホストとVPSの下流を兼ねるホストでは、公開先とComposeの選択が異なる。
設定の正本は[設定例](../../../examples/compose.env)と[Compose設計](compose.md)、環境固有の値は非公開の `.env`で管理する。
本書は準備・日常開発・確認を対象とし、実ホストの配備履歴はタスクと非公開記録に分ける。

## 構成を選ぶ

| 用途                                       | プロファイル        | Composeファイル                                                                                                |
| ------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| 同じPCで全体を開発・利用                   | `full,chat`         | `compose.yml`                                                                                                  |
| VPSの下流も担当し、ローカル画面・RTCも使う | `full,chat`         | 基本構成と `compose/distributed.yml`。ホストからRTC・Consulへ保守接続する場合は `compose/management.yml`も追加 |
| VPS向けの下流と中央ログだけを担当          | `backend,chat,logs` | 上と同じ分散構成                                                                                               |

`full`だけではAgentServerとLLMが起動しない。会話には `chat`を追加する。
中央ログは分散環境の1台だけで起動する。Dify・Ollama・MinIOの旧手順は使わない。
VPSへ接続する開発環境を単一ホスト用の設定へ戻すと、VPSから下流を探索・利用できなくなる。

## 初回準備

1. [必要なもの](../../../README.md#必要なもの)に従い、Linux、Docker Engine / Compose v2、NVIDIAドライバーとContainer Toolkitを用意する。認識とLLMはGPUを共有する。
2. [ホストのjournal](logging.md#ホストのjournal)に従い、永続保存・読み取り・容量管理・時刻同期を準備する。
3. リポジトリルートで、`.env`がない場合だけ `examples/compose.env`をコピーする。既存環境は差分を取り込む。
4. [Docker Compose管理ルール](../../rules/docker-compose.md#開発用イメージとディスク容量)に従い、接続先・ビルダー・Docker保存先の空き容量を確認する。初回はイメージとモデルの取得がある。

```sh
# 新規配置でのみ実行する。既存.envを上書きしない。
test -e .env || cp examples/compose.env .env
docker context show
docker compose config --quiet
docker compose config --services
docker compose config --images
docker compose up -d
docker compose ps -a
```

標準構成は現在のソースを自動ビルドする。認識モデルとチャット用GGUFは欠損時に取得する。
`service-initializer`、`llama-model-initializer`、`s3-credential-initializer`、`s3-bootstrap`は正常終了が完了状態であり、常駐しない。
初回のモデル読み込み中は準備完了を待つ。認識には30分の準備時間が設定されている。
保存先・認証生成・既存データの引継ぎは[保存領域](storage.md)を参照する。

## VPSの下流を兼ねる場合

既存 `.env`に次の差分を反映する。実アドレスは非公開の環境台帳へ記録する。

- `COMPOSE_FILE=compose.yml:compose/distributed.yml:compose/management.yml`を基本とし、利用中のイメージ上書きファイルがあれば選択を維持する。
- `SINCRO_CONSUL_PUBLISH_HOST`と `SINCRO_CONSUL_ADVERTISE_ADDR`にこのホストの管理IPv4を指定する。
- ローカルConsulサーバーを使う `SINCRO_CONSUL_SERVER_HOST`は内部サービス名 `sincro-consul-server`を使える。
- `SINCRO_EXTRACTOR_PUBLIC_BIND_HOST`、`SINCRO_RECOGNIZER_PUBLIC_BIND_HOST`、`SINCRO_PROCESSOR_PUBLIC_BIND_HOST`、`SINCRO_SYNTHESIZER_PUBLIC_BIND_HOST`を管理IPv4へ揃える。
- ローカルRTCも使う場合は `SINCRO_PION_SERVICE_BIND_HOST`を管理IPv4にする。`SINCRO_PION_PUBLIC_IPV4`はブラウザーから届くIPv4を別に指定する。
- `SINCRO_LOG_HOST`をホストごとに一意にする。分散構成は中央ログの広告先を管理IPv4へ切り替える。

必要なポートと相互到達条件は[Consulの接続設定](consul.md#複数ホストの接続設定)と[VPS配備](vps-deployment.md#配置と接続の前提)を参照する。
既存プロジェクト名を変えると保存ボリュームの選択も変わるため、名称整理だけを目的に変更しない。

## 画面を編集する

Node.js / npmの採用版はルートの `.node-version`と `package.json`に従う。
依存はルートで導入する。AgentServerの依存管理は別である。

```sh
npm run check:runtime
npm ci
npm run dev
```

表示されたViteのURLで画面を確認する。現行の `vite.config.js`にはAPIプロキシがないため、
`npm run dev`だけで会話用APIやバックエンドが揃うわけではない。
会話の一連の動作は、フロントを反映したComposeの `http://localhost:8086/`で確認する。
変更したフロントを反映する例は次のとおり。イメージの上書き選択は次節も確認する。

```sh
docker compose up -d --build sincro-frontend
```

フロント専用イメージとRTC同梱フロントは別のビルド成果物である。
RTCから画面を配信する配置やVPSへ反映するときは `sincro-rtc`も更新する。
別端末でマイク・カメラを使う場合は、信頼できるHTTPSと到達可能なメディアIPv4 / UDPが必要である。

## 検証用ローカル環境の運用

検証用のローカル環境は必要なときだけ手動で起動する。コンテナがないこと自体は異常ではない。
VPSの下流と中央ログを兼ねる場合、両入口の会話・ログ配送の確認はローカル起動中に行う。
検証後は保存マウントを確認し、`docker compose down`（`-v`なし）でコンテナとネットワークを終了する。
名前付きボリューム・モデル・辞書・更新済みイメージは保持し、次回は同じ設定の `docker compose up -d`で手動起動する。
配備イメージを使う環境では、上書きファイルの `pull_policy: never`で検証済みの版を選ぶ。
既存の `restart: always`相当のサービスは `stop`だけではDocker再起動時に復帰し得るため、検証終了とは区別する。
ローカル停止中はVPSのRTCが起動していても、下流処理と中央ログ配送は利用できない。

## 更新と確認

1. `git status --short`、現在のコミット、`.env`のCompose選択、`config --images`を確認する。
2. 過去の配備イメージへ固定する上書きがある場合は、固定版の維持とソースからの再ビルドのどちらを行うか決める。固定した配備・復旧タグのまま `--build`すると、そのタグを上書きし得る。再ビルド対象には別の開発用タグを選ぶ。
3. 更新対象と必要な依存だけをビルド・再作成する。設定変更は `restart`だけでは反映されない。
4. `docker compose ps -a`で常駐サービスの状態と初期化の終了コードを分けて確認する。異常時は対象を絞って `docker compose logs --tail 100 <サービス名>`を確認する。ログは非公開で扱う。

```sh
curl --fail --silent --show-error http://localhost:8086/api/v1/Frontend/statuses
curl --fail --silent --show-error http://localhost:8086/api/v1/RTCSignalingServer/statuses
docker compose exec -T consul-agent-rtc consul members
```

会話確認ではRTC/ICE接続、認識、応答、非無音の音声、テロップ、切断・欠落の有無を確認する。
Consulのメンバー一覧だけで下流サービスがpassingとは判断しない。中央ログの新着と収集・配送状態も確認する。
VPSへ下流を提供している場合はVPS入口からも確認する。ComposeフロントはConsul経由でRTCを選ぶため、ローカルRTC自体の確認には管理ポートと接続ログも使う。

コードの確認は変更範囲に合わせる。フロントのビルド・型確認は `npm run build`、対象テストは `npm test -- <対象>`を使う。
Markdownだけの変更にビルドや実会話を追加しない。ブラウザー自動操作は[Playwright CLI利用ルール](../../rules/playwright-cli.md)に従う。

作業中の一時停止には対象サービスの `docker compose stop <サービス名>`を使う。VPSの下流を兼ねる場合、停止はVPS側の会話にも影響する。
通常の更新・復旧で保存ボリューム、モデル、辞書、journal、ログのカーソルや配送バッファを削除しない。
作成したイメージ・キャッシュ・退避物の保持条件は[Docker Compose管理ルール](../../rules/docker-compose.md#作成物の追跡と保持)に従って記録する。

## 変更時の確認

Composeのサービス名・プロファイル、設定例、ルートのnpmスクリプト、ViteのAPI転送設定を変更した場合は本書も確認する。
環境固有の実値と確認日時は非公開台帳へ、実施結果と未確認範囲はタスクへ記録する。
