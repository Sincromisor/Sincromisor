# VPSへの配備手順

## 要約

VPSは `rtc`プロファイルでRTCとログ収集を動かし、管理VPN経由で別ホストの音声処理・会話生成・中央ログを使う。
ソース、Compose、マウントする設定・スクリプト、イメージ、静的フロントを対応する組合せで配備する。
本書は既存の分散構成への配備・確認・復旧を対象とし、VPNやHTTPS終端の初期構築は管理者が別途行う。
実接続先と現在の配備状態は非公開台帳、作業履歴はタスクへ保存する。

## 配置と接続の前提

| 配置先           | 担当                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| VPS              | `sincro-rtc`、`consul-agent-rtc`、`vector`、`log-observer`、`log-router`、`consul-agent-logging`の6サービス                    |
| 開発・下流ホスト | Consulサーバー、下流4サービスと依存先、AgentServerとLLM、中央ログ。選択は[ローカル開発](local-development.md#構成を選ぶ)を参照 |
| VPSホスト側      | HTTPS終端、管理VPN、永続journal。Composeの `log-router`はログ転送用で、ブラウザー向けHTTPS終端ではない                         |

VPSには `frontend`や `logs`プロファイルを追加しない。RTCイメージにフロントを同梱する。
実際のイメージ参照は `config --images`を正とし、版一覧を手順へ複製しない。

| 経路               | 必要な公開・到達先                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------ |
| ブラウザー → VPS   | HTTPS終端のTCP 443、RTCのメディアUDP（設定例は3479）                                       |
| HTTPS終端 → RTC    | `management.yml`の `127.0.0.1:8001/TCP`                                                    |
| 管理VPN内 → VPS    | RTCのTCP 8001、同居ConsulのTCP/UDP 8311・8320                                              |
| VPS → 下流ホスト   | 下流APIのTCP 8002〜8005、中央ログのTCP 9428、ConsulサーバーのTCP 8300・TCP/UDP 8301        |
| Consulメンバー相互 | 管理IPv4と広告ポート。担当別の8311〜8321は[接続設定](consul.md#複数ホストの接続設定)を参照 |

管理用公開はVPNの参加ホストに限定する。中央ログの9428には検索APIも含まれる。
VPSのConsul HTTP 8500、ログ転送8080、監視APIはホストへ公開しない。
`management.yml`を選んでも `rtc`ではConsulサーバーが起動しないため、ホストの8500は開かない。
メディアはIPv4・UDPの直接到達が前提で、TURNは未対応である。

## 環境設定

既存 `.env`へ[設定例](../../../examples/compose.env)との差分を取り込む。以下の山括弧は非公開台帳の実値へ置き換える。
これは設定の差分であり、`.env`全体の置換には使わない。

```dotenv
COMPOSE_PROFILES=rtc
COMPOSE_FILE=compose.yml:compose/distributed.yml:compose/management.yml
SINCRO_CONSUL_SERVER_HOST=<下流ホストの管理IPv4>
SINCRO_CONSUL_PUBLISH_HOST=<VPSの管理IPv4>
SINCRO_CONSUL_ADVERTISE_ADDR=<VPSの管理IPv4>
SINCRO_PION_SERVICE_BIND_HOST=<VPSの管理IPv4>
SINCRO_PION_PUBLIC_IPV4=<ブラウザーから届くVPSのIPv4>
SINCRO_PION_INTERFACE=eth0
SINCRO_PION_MEDIA_UDP_PORT=3479
SINCRO_PION_STUN=
SINCRO_LOG_HOST=<ホストごとの一意な識別子>
```

固定公開IPv4へ直接接続する場合はSTUNを空にできる。Consul登録先とブラウザー向けIPv4は用途が異なる。
既存のComposeプロジェクト名と、必要なイメージ上書きファイルの選択を維持する。
`--profile rtc`を追加するだけでは既存 `COMPOSE_PROFILES`を置き換えないため、保守時は以下のように明示する。
全6サービスで使う[journalの準備](logging.md#ホストのjournal)はホストごとに済ませておく。

## 1. 更新前の確認と退避

非公開台帳のSSH接続先へ接続し、配置先のリポジトリルートで実行する。

```sh
git status --short
git branch --show-current
git rev-parse HEAD
docker context show
COMPOSE_PROFILES=rtc docker compose config --quiet
COMPOSE_PROFILES=rtc docker compose config --services
COMPOSE_PROFILES=rtc docker compose config --images
COMPOSE_PROFILES=rtc docker compose ps -a
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

- 選択したComposeファイルの順序と6サービス、ポート、マウントを確認する。構成全体には秘密が含まれるため、そのまま表示・公開しない。
- Gitの履歴と未コミット変更を確認し、無条件のreset・rebaseで既存の配備履歴を破棄しない。
- 設定・追加Compose・ソースSHA・コンテナのイメージID・起動コマンド・必要な復旧タグを、更新ごとの非公開領域へ保存する。退避済みファイルは上書きしない。
- HTTPS終端が静的ファイルを直接配信する場合は、設定上の配信元を確認してその内容も退避する。
- [容量確認と作成物の管理](../../rules/docker-compose.md#開発用イメージとディスク容量)に従い、開発側のビルダーとVPS側の保存先を確認する。保存データの変更を伴う場合は[保存領域](storage.md)の退避条件も確認する。

## 2. ソースとイメージを揃える

配備対象コミットを先に決め、対応するソース・Compose・マウントする設定とスクリプトをVPSへ同期する。
稼働中にも参照されるバインドマウントの変更は、必要な停止時間に合わせて反映する。
通信契約の変更があれば下流と両RTC・フロントの切替対象を先に決める。

### レジストリから取得する場合

[イメージ公開](image-publishing.md)の公開結果から、対象ソース・履歴タグ・配布ダイジェストを確認する。
`latest`という名前だけでは対象ソースとの一致を保証しない。
ローカル専用タグへの上書きを使っている場合、取得できる配布参照へ切り替える準備が必要となる。

```sh
COMPOSE_PROFILES=rtc docker compose pull --policy always
COMPOSE_PROFILES=rtc docker compose config --images
```

RTCの `pull_policy: build`による取得省略を避けるため、配布物を使うときは `--policy always`を明示する。
対象の `docker image inspect --format '{{json .RepoDigests}}' <イメージ参照>`を公開記録と照合する。
取得失敗やダイジェスト不一致があれば再作成へ進まない。

### 開発環境から直接転送する場合

対象イメージが未公開で、管理下で作成済みのイメージを使う場合に選ぶ。VPS上でのビルドを通常手順にしない。
開発環境でコミット済みソースから作成したイメージに一意のタグを付け、ソースSHAとイメージIDを記録する。
VPSに必要な自作イメージはRTC・Vector・ログ監視であり、変更のないものは既存版を維持できる。

次は開発側のbashで1イメージを転送する例である。`deploy_image`は実在するタグ、`vps_ssh`は非公開台帳の接続先を事前に設定する。

```sh
set -o pipefail
docker image inspect --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$deploy_image"
docker image save "$deploy_image" | gzip | ssh "$vps_ssh" 'gzip -d | docker image load'
```

転送先でも同じタグのIDを取得して一致を確認し、リビジョンラベルがない既存イメージはビルド記録でソースを確認する。
VPSの上書きファイルで対象サービスの `image`を転送済みタグへ固定し、必要なComposeファイル一式の末尾に選択する。
この構成ではレジストリ向けの一括 `pull`を実行しない。外部イメージを更新する場合だけ対象サービスを明示して取得する。

## 3. 反映と静的配信の同期

両入口の会話終了とRTCのセッション数0を確認する。
通信契約を破壊的に変更する配備では、旧RTCが新しい下流へ接続しないよう両RTCを停止し、互換性のある下流・RTC・フロントを揃えて再開する。

```sh
COMPOSE_PROFILES=rtc docker compose up -d --no-build --pull never
COMPOSE_PROFILES=rtc docker compose ps -a
curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
```

初回や構成全体の更新ではサービス名を限定せず6サービスを揃える。既に揃っている構成の局所更新は対象を限定できる。
`sincro-rtc`だけの起動ではログ収集4サービスは追加されない。設定反映に `restart`だけを使わない。

HTTPS終端がRTCへ静的ファイルも転送する配置なら、RTC更新でフロントも切り替わる。
ホストから直接配信する配置では、新RTCの `/opt/sincromisor/frontend/`を一時領域へコピーし、退避済みの配信元へ同期する。
HTMLだけでなく参照JS・画像・VRMも揃え、配信ユーザーが読める権限にする。旧ファイルの整理範囲は配信元に限定する。
コンテナから取り出した成果物と公開HTTPSのHTML・参照JSのハッシュを照合する。
静的配信先は環境ごとに異なるため、過去のパスを推測で使わない。

## 4. 完了確認

```sh
COMPOSE_PROFILES=rtc docker compose exec -T consul-agent-rtc consul members
COMPOSE_PROFILES=rtc docker compose exec -T consul-agent-logging consul members
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

- 実コンテナのイメージID・起動コマンドが選択したものと一致し、6サービスが正常である。
- Consulのクラスタ参加、必要な登録のpassing、VPSから下流4サービスの探索とAPI到達を確認する。メンバー数を過去の固定値だけで判定しない。
- 公開HTTPSのステータス、静的ファイル、ブラウザーの会話を確認する。RTC/ICE接続に加え、認識・応答・非無音音声・テロップ・再接続や音声欠落の有無まで確認する。
- 各ホストの新着ログを中央で検索し、収集・配送の異常や破棄を確認する。RTCのreadyやコンテナのhealthyだけでは、会話と中央ログ配送の成功を保証しない。
- 確認終了後のセッション0、作成物の保持理由・整理条件・空き容量を記録する。過去のログ欠落を新着配送の成功で解消済みとしない。

下流停止中や会話未実行なら、その段階を未確認として残す。実施結果は[公開設計の記録項目](image-publishing.md#保守実施記録)に従い、実接続先や会話原本を公開タスクへ転記しない。

## 復旧と上書きファイルの管理

障害の時刻・対象・必要なログを非公開で保存し、退避した互換性のあるソース・設定・イメージ・静的フロントへ戻す。
通信契約変更時はRTCだけを旧版へ戻さず、両RTCと下流・フロントを揃える。
一時上書きを使う場合、`-f`は `.env`の `COMPOSE_FILE`を置き換えるため、必要なファイル一式を同じ順序で選び、復旧用ファイルを最後に重ねる。
過去の上書きが残る環境では、分散用・管理用だけの指定に縮めると、変更対象外のイメージ固定も失われる。

上書きファイルが増えた場合は、次回配備時に現在の有効な `image`指定を1ファイルへまとめる。
切替前後の構成を非公開で比較し、イメージ以外の変更も引き継いでいることを確認してから `.env`を切り替える。
古いファイル・タグは参照が外れ、正常確認と新しい復旧情報の確保が済むまで保持する。
名前が `rollback`でも稼働用に参照されているタグは削除しない。

VPSの `consul-agent-rtc-data`、`consul-agent-logging-data`、`vector-data`、`observer-data`とホストjournalを維持する。
通常の復旧で保存領域やログの読取位置・配送待ちを削除しない。復旧後も同じ完了確認を行う。

## 変更時の確認

RTC・ログ収集のCompose、分散用・管理用の公開先、イメージ公開手順、RTC同梱フロントの配置を変更した場合は本書を照合する。
環境台帳には接続先、Compose選択、配備SHA、イメージ参照、静的配信元、退避先と最終確認日を残す。
