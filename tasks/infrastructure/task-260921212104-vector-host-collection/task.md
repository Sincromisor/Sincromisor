# 各ホストのVectorで全サービスのログを収集する

## 背景と目的

[中央保存と共通仕様](../task-260921212053-victorialogs-foundation/task.md)に従い、各DockerホストにVectorを1つ配置する。
アプリのJSON化を待たず既存のテキスト出力から収集し、ホスト・サービスで横断検索できる状態にする。

## 変更範囲と方針

- `compose.yml`にincludeする標準定義へVectorを加え、各サービスの既存プロファイルで1ホスト1収集インスタンスを起動する。標準`docker compose up`の中で収集を開始し、別のCompose起動や「先に手動で収集起動」を要求しない。
- ホスト識別子`SINCRO_LOG_HOST`と同居Consulへの接続設定を`.env`から渡す。[確定した接続経路](../task-260921212053-victorialogs-foundation/task.md#consulでの接続経路)の`log-router`と`consul-agent-logging`を標準起動へ同梱する。VectorはローカルのCaddyへ送り、CaddyがConsul DNSを明示して中央を動的に解決する。新エージェントのgossipポートは既存8311〜8319と重ならない8320を使い、分散用定義も同期する。
- ローカルDocker APIから、明示したSincromisorのComposeプロジェクトだけを収集する。
- 対象はRTC、Caddy、音声処理4サービス、AgentServer、llama-server、VOICEVOX、Redis、SeaweedFS各構成要素、Consul各エージェント、bandog、初期化・S3設定用コンテナ、選択時のMediaMTXとする。
- 収集・保存自身も対象にし、Vector自身は内部ログ入力などで循環を避ける。短時間で終了する初期化コンテナも、標準起動順と残存ログの回収で取り込む。起動競合を手順上の注意だけで済ませず、[回収タスク](../task-260921221014-logging-delivery-recovery/task.md)で自動回収を確認する。
- JSONは項目を取り出し、Goの構造付きテキストとPython・周辺サービスのテキストは必要な範囲で解析する。解析不能な本文は残す。
- ホスト・サービスなど収集側の識別項目を本文に上書きさせない。複数行の例外を別コンテナのイベントと結合せず、`stderr`だけを理由に`error`としない。
- HTTP JSONLで中央へ送り、送信バッファを永続ディスクへ置く。容量上限と満杯時の動作を明示し、既存の再試行機能を利用する。
- Docker側のローカル保持とローテーションを明示し、中央への直接送信ドライバーへ依存させない。`local`ドライバーとDocker API入力を出発点とし、[回収タスク](../task-260921221014-logging-delivery-recovery/task.md)で停止中の残存ログを回収できる方式へ必要なら変更する。特定の入力方式を守るために回収要件を削らない。
- Dockerソケットを管理用権限として扱い、`:ro`だけではAPIを読み取り専用にできないことを記載する。不要な特権やDocker APIのホスト公開を追加しない。
- 送信失敗、破棄、バッファ滞留を既存ログ・指標で確認可能にする。監視製品を追加必須にしない。

## 棚卸しとの対応

[網羅性表C01〜C33](../task-260921221013-logging-coverage-inventory/coverage.md)のComposeサービス名を対象設定と照合する。
標準includeは30サービス、全Composeファイルは33サービスである。MediaMTXに加え、標準外の`compose/minio.yml`を選ぶ場合の`sincro-minio`と`consul-agent-minio`も収集対象とする。
未選択はその構成条件を記録し、選択済みのサービスを未確認のまま非収集へ移さない。製品出力の実確認と、中央からの抽出確認を分けて記録する。

## 完了条件

- [x] 全サービスが対象に入り、新規・再作成後のコンテナを収集できる。
- [x] JSON、日本語、解析不能な行、例外を人工的に出し、時刻・ホスト・サービス付きで中央から抽出できる。
- [x] 中央停止中に収集したイベントを永続バッファへ保持し、復旧後に送信する。収集再起動とDockerローテーションについては回収タスクの再開位置・再送・欠落検知の契約と整合させる。
- [x] Vector停止中も業務コンテナを起動でき、`docker logs`を利用できる。ディスク満杯まで無停止・無欠落を保証する説明をしない。
- [x] 初期化コンテナも収集設定に含まれ、起動競合・残存原本・必要な回収設定を確認する。単一コマンド起動での自動回収の実装・合格判定は後続の回収タスクが担当し、ここで完了済みとは扱わない。
- [x] 各ホストのVectorがConsulで個別に監視され、中央の発見失敗・登録先変更・復旧を処理できる。
- [x] Consul DNSから取得した中央へCaddy経由で投入できる。未登録・critical・Consul不通で5xxとバッファ滞留を確認し、中央の登録先変更後に新アドレスへ再送される。直接IP設定でこの確認を代用しない。

## 確認方法と文書同期

Vector設定の検証と少数の固定入力を使う。隔離Docker環境で通常・短時間コンテナと中央の停止・復旧を一度確認する。
2ホスト間の到達は[結合確認](../task-260921212106-distributed-logging-acceptance/task.md)で行う。稼働会話に障害を注入しない。
`examples/compose.env`、追加Compose、`documents/design/infrastructure/logging.md`と`compose.md`を同期する。
ホスト間接続先、時刻同期、バッファとDocker保持量の違い、再作成による設定反映を案内する。

## 対象外と調査根拠

アプリ内部、Docker状態イベント、[ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md)、[ホスト障害](../task-260921221014-host-system-diagnostic-logs/task.md)、[配送対策](../task-260921221014-logging-delivery-recovery/task.md)は担当タスクで補う。これらを導入全体の対象外としない。
2026-09-21確認。[Docker入力](https://vector.dev/docs/reference/configuration/sources/docker_logs/)はbest effortで無欠落再開を保証しない。
[ディスクバッファ](https://vector.dev/docs/architecture/buffering-model/)と[Dockerログ設定](https://docs.docker.com/engine/logging/configure/)の保証範囲を区別する。

## 実装と確認結果

- 2026-09-22: Vector 0.58.0、Caddy 2.10.2、収集専用Consulを全既存プロファイルへ同梱した。プロジェクトラベルで対象を限定し、全ComposeサービスへDockerのlocalドライバー・20m×5世代の原本保持を設定した。
- C01〜C33はサービス名の除外なしで収集対象となる。標準構成の全サービスにログ保持設定があることを確認した。任意構成のMediaMTX・MinIOは未選択であり、設定確認のみ。製品ごとの起動・正常要求・異常要求の実ログ抽出は最終結合確認で行う。
- Vectorの3件の固定入力確認で、JSON・構造付きテキスト・日本語・例外、収集側識別子の優先、認証属性の除去、stderrから重大度を推測しないことを確認した。
- 隔離Composeで日本語と解析不能な行の投入、中央停止中のディスク保持、別IPへの再作成後の再送、Vector停止中のDocker原本保持、業務コンテナ再作成後の収集を確認した。短時間の初期化コンテナも同じラベル・原本保持に含めたが、起動前原本の自動回収は後続の回収タスクの担当として残す。
- 中央用エージェント8321と収集用8320を分け、個別のCollector・Router登録を確認した。Vectorへ中央IPは渡さず、Caddyの明示Consul DNS経由で投入する。
- 全体ゲートは変更前からあるMarkdown15件の整形不一致で停止した。変更文書の整形、対象Biome、Composeの標準・分散設定は合格。別途実行したフロントのビルドと単体テスト（640件成功、2件既存スキップ）が合格した。
- 最終の隔離確認に未登録時の503、Consul停止時の503と復旧後再送、投入以外の404、別Composeプロジェクトの除外を追加した。既定の再試行とConsul再同期を待ち、直接IP指定による代用はしていない。
