# ログ収集をComposeサービス群に限定しDockerソケット依存を削除する

## 背景と目的

ユーザーは、Sincromisorの責務を複数ホストに配置され得るComposeサービス群のログ収集に限定し、ホストやDocker daemonの監視まで含めない構成を指定した。Dockerソケット共有の危険性への対策として、journaldによる既存の収集経路を維持し、Docker管理権限と基盤監視の機能を取り除く。

起票時のHEADは `5a8ebd8f8fe44b3ee8530998d829689e00f047dc`。ログ本文はすでにjournald経由であり、ソケットはobserverのEvents・inspect、Vectorの正常性・再起動判定、Consulエージェントの発見に使われている。mount削除だけでは配送監視が成立しないため、これらを同時に整理する。

## 設計判断と範囲

- 各ホストで `stdout/stderr → journald → Vector → log-router → 中央VictoriaLogs` を維持する。収集対象は設定されたComposeプロジェクトに属するコンテナだけとし、自前・第三者製品・初期化・ログ基盤・Consulコンテナの出力を含める。
- `host`、`project`、`service`、`container_id`で配置と個体を識別する。`SINCRO_LOG_HOST`はホストごとに一意、収集プロジェクトは既存の `COMPOSE_PROJECT_NAME`から供給する。ホストごとの収集と中央保存の分離を維持する。
- Docker Events・inspect、OS・kernel・systemd・Docker/containerd daemonの診断変換、ConsulチェックAPIの巡回と結果のログ化を削除する。代替のDocker APIプロキシやホスト常駐処理は追加しない。
- log-observerはログ収集・配送の監視へ縮小する。Vectorの指標、原本消失marker、観測状態の保存を用いた配送異常・滞留・破棄・不明区間の検知は残す。
- 既存のサービス用Docker healthcheck、Consulによるサービス登録・チェック・中央保存先の発見は維持する。結果の中央ログへの複製だけを廃止し、ログ基盤を業務サービスの起動条件にしない。
- journalの読取専用共有を維持する。ラベルによる収集範囲の制限は読取権限の分離ではなく、Vectorには共有journalを読める権限が残ることを文書へ明記する。
- ログドライバー変更、journal権限の完全分離、別の監視製品導入、保存製品変更、既存ログの削除は対象外とする。

## 実装方針

### 収集と権限

[Vector設定](../../../configs/vector.toml)からホスト診断用の入力条件と `host_diagnostics`、observerの `docker_*`イベント用の対象ID変換を削除する。Composeラベルによる入力選別と、本文の識別情報を信用しない正規化を残す。

[収集Compose](../../../compose/log-collector.yml)からDockerソケットmountを削除し、[observer](../../../Docker/logging/observer/main.go)のDocker用HTTPクライアント、Events・inspect、ローカルConsul探索、[Consul巡回](../../../Docker/logging/observer/consul.go)と不要な状態・設定を除く。ネットワーク経由のDocker APIへ置き換えない。ビルド対象と不要テストも同期する。

### 収集自身の状態

[Vectorの確認処理](../../../Docker/logging/check-vector.sh)による実journalの読取・cursor・追尾確認を維持する。Docker healthcheckのinspect結果に代わり、Vector側で生成する小さな状態ファイルを既存の `vector-data`経由でobserverへ渡す。書込側はVectorコンテナ、読取側はobserverとし、observerからは読取専用を維持する。

状態には起動ごとの識別子、確認時刻、正常性、安全な固定理由を持たせる。起動時には前回の正常結果を無効にし、確認結果を原子的に更新する。observerは状態の欠落・不正・期限切れ・未来時刻とVectorの到達不能を正常扱いしない。確認周期と有効期限を実装で定義し、停止・再作成後の古い正常結果を使わない。状態ファイルへログ本文・秘密情報は保存しない。

[配送監視](../../../Docker/logging/observer/delivery.go)の `StartedAt`依存をこの起動識別子へ変更し、再起動時の累計比較と不明区間の記録を維持する。既存 `observer-data`の保存状態は安全に読み替えるか、不明区間として再初期化し、ボリューム削除を移行手順にしない。

既存の内部8687 `/collector`と `/health`、[Consul登録](../../../Docker/logging/start-collector-consul.sh)はログ収集・配送の状態だけで判定する。HTTP生存だけを正常条件にせず、削除したDocker・Consul照会にも依存させない。新たなホスト公開ポートは追加しない。

### 保存と配送

journal原本、入力名 `host_journal`、永続cursor、`vector-data`のディスクバッファ、中央ACK後の読取位置確定を維持する。短命・削除済みコンテナ、収集停止中の残存原本、中央停止中の未送信ログを回収できることを保つ。

本文記録の切替、秘密情報除去、非同期ログ出力を維持する。原本前のDockerメモリバッファの破棄は引き続き未計測とし、無欠落や厳密に一度だけの保存を保証しない。

## 完了条件

- [x] Sincromisorのログ基盤がDockerソケット・Docker APIへの接続なしで起動し、対象Composeサービス群のログを中央で検索できる。
- [x] 対象外Composeのログとホスト・Docker daemonのログを中央へ送らず、Docker状態・Consulチェックの補助イベントも生成しない。
- [x] サービス識別、本文制御、秘密情報除去、短命コンテナと残存原本の回収、中央停止・復旧時の保持と再送を維持する。
- [x] Vectorのjournal読取失敗・停止・再作成、古い状態ファイル、配送失敗を検知し、復旧後に正常へ戻る。原本消失markerによる異常は既存の確認・解除方針を維持する。
- [x] 複数の収集元が同じ中央へ送信してもホストとサービスを区別でき、収集元同士のDocker APIや共有ボリュームを必要としない。
- [x] 削除する監視イベント、残る権限と配送限界を設計へ反映し、必要な対象確認が通る。

## 確認方法

- Vectorの既存設定テストを更新し、対象サービスの採用、対象外プロジェクト・ホスト診断の除外、識別子偽装の拒否、本文制御を確認する。
- observerのGoテストで状態の鮮度・起動識別子・異常と復旧・保存状態の移行・配送累計を確認する。Docker由来のテストを削除するだけでなく、置換後の状態判定を検証する。
- `scripts/tests/log-collector.test.mjs`を中心に、人工ログの隔離Composeでソケットなしの中央到達、収集停止中に終了・削除したコンテナの回収、中央停止中の保持と復旧、Vector停止・再作成時の状態判定を確認する。`log-lifecycle.test.mjs`の廃止対象を整理し、残す確認は適切なテストへ移す。
- 複数ホストの役割は、異なるホスト識別子と独立した収集状態を持つ2つの隔離収集構成から1つの中央への投入で確認する。別物理ホストの用意は必須にせず、物理ホスト間の疎通確認と同一視しない。
- Compose展開結果でソケットmount・Docker接続設定の除去、既存の内部登録先と公開ポートを確認する。変更したGo・シェル・設定・文書を対象に静的確認する。
- 実ログや実ホストの原本を削除しない。失敗時は人工入力と診断を保存して隔離構成を後始末する。今回の変更による必須確認の失敗は修正してから完了する。

## 文書と契約の同期

[ログ設計](../../../documents/design/infrastructure/logging.md)、[Consul設計](../../../documents/design/infrastructure/consul.md)、[保存領域](../../../documents/design/infrastructure/storage.md)を同期する。設定を変更する場合は `examples/compose.env`と該当Composeも更新する。現在仕様からDocker監視やホスト診断の提供を削除し、過去タスクの実施記録は書き換えない。

`docker_lifecycle`、`docker_health`、`docker_health_query_failed`、`consul_check`、`host_diagnostic`等の自動生成廃止は、中央ログで利用できる診断範囲の破壊的変更として明記する。既存保存ログは消さず、RTC・音声パイプラインの通信契約は変更しない。Dockerソケット権限の縮小と配送状態の変更を伴うため、起票時に独立レビューを行う。

## 実装・確認結果

- Dockerソケット共有、Docker Events・inspect、Consulチェック巡回、ホスト診断の変換を削除した。Composeラベルによる選別、本文の正規化と秘密情報除去、journal原本・永続cursor・ACK付きディスクバッファを維持した。
- Vectorが起動IDと収集状態を原子的に保存し、observerは鮮度・固定理由・配送指標・原本消失markerから正常性を判定する。指標取得中の再作成を拒否し、配送まで確認した周期だけ内部HTTPへ正常状態を公開する。
- `go vet main.go delivery.go`と`go test -race main.go delivery.go main_test.go delivery_test.go`、変更シェルの`bash -n`、Vector設定テスト6件が成功した。旧観測状態、累計、破棄、再試行、復旧、指標取得中の再作成も確認した。
- Linux Dockerの隔離構成で`node --test scripts/tests/log-collector.test.mjs`が成功した。対象分離、本文・識別情報、Consul未登録・停止、中央停止・IP変更後の再送、停止中の短命削除済みコンテナの回収、Vectorの起動ID変更と異常からの復旧を確認した。
- `node --test scripts/tests/log-multihost.test.mjs`が成功した。独立ネットワーク・状態ボリュームを持つ2収集元から中央1台へ送信し、ホスト・プロジェクト・サービス・コンテナを識別できた。両試験の専用コンテナ・ボリューム・ネットワークは後始末済みである。
- `npm run gate`、変更Markdown整形、差分検査が成功した。独立評価とコメント点検を実施した。試験中に判明した制限と修正は[実装補足](impl.md)、最終判定は[評価](eval.md)を参照する。
- ログイベントの提供範囲は破壊的変更として設計へ反映した。共有journalへの読取権限は残り、原本前のDockerメモリバッファの破棄は未計測である。既存ログは削除していない。別物理ホスト間の疎通と稼働中環境への適用は行っていない。
