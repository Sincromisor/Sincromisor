# Docker基底イメージと外部サービスの採用版を更新する

## 背景 / 目的

ユーザー要求に基づき、Dockerfile内の基底イメージ・導入ツールとComposeの外部サービスイメージを調査し、互換性を維持できる公開安定版へ更新する。調査基準日は2026-10-24。

## 完了条件

- [x] 公式レジストリ・リリースで採用版を確認し、更新可能な未固定の外部イメージを具体的な版またはダイジェストへ固定する。配布終了などで更新できないものは理由と影響を記録する。
- [x] Node・npm、Go、uvなどの採用版をDockerfileと対応する依存定義・開発環境・設計で同期する。
- [x] 配布サンプルを使うCompose構成検査と変更範囲の静的検査を行い、更新候補の存在を確認する。
- [x] 採用版、見送り理由、実行した確認と未実行範囲を記録する。

## 変更範囲・判断

`Docker/**/Dockerfile`、`compose/*.yml`、必要に応じて`.node-version`、`package.json`、`go.mod`、現行設計を同期する。自前サービスのローカルビルド用タグと`pull_policy: build`は維持する。OS・CUDA・言語ランタイムの系列変更は具体的な必要性がある場合のみ行う。

ポート、設定名、保存領域、実行UID、起動依存を維持する。VOICEVOXは直前の専用更新で検証されたEngine・Core・モデルを維持し、共通ビルドツールだけを調査する。稼働中サービスの再作成や本番反映は含めない。

## 確認方法・文書同期

`docker compose --env-file examples/compose.env -f compose.yml config --quiet`と変更した追加構成を確認する。イメージの公開版はレジストリのメタデータ・マニフェストで確認する。ビルドする場合は容量と作成物を追跡し、リポジトリのDocker Compose管理ルールに従う。

`documents/design/infrastructure/compose.md`、READMEなどの現行採用版を同期する。ビルド・実起動を実行できなければ範囲と理由を記録し、構成検査と実稼働の確認を区別する。

## 実装・確認結果

| 対象                  | 更新前                  | 採用版                                          |
| --------------------- | ----------------------- | ----------------------------------------------- |
| フロント用Node / npm  | 26.11.1 / 11.20.0       | 26.12.1 / 11.21.1                               |
| AgentServer用Node     | 24.21.0                 | 24.22.1                                         |
| Goビルド環境          | 1.26.9                  | 1.26.10                                         |
| uv                    | 0.13.1                  | 0.13.5                                          |
| VOICEVOX用Python      | 3.14.6                  | 3.14.9                                          |
| Consul                | 未固定、既存取得版2.0.4 | 2.1.0                                           |
| Caddy                 | 未固定 / ログ転送2.10.2 | 2.11.7、ログ転送は同版alpine                    |
| Redis                 | 8                       | 8.10.2                                          |
| curl                  | 8.12.1 / 未固定         | 8.23.0                                          |
| BusyBox               | 1.37.0-uclibc           | 1.38.0-uclibc                                   |
| Vector / VictoriaLogs | 0.58.0 / v1.52.0        | 0.60.0 / v1.53.0                                |
| MediaMTX              | 未固定                  | 1.21.2                                          |
| SeaweedFS             | 未固定、既存取得版4.48  | 4.48                                            |
| llama.cpp CUDA 13     | 旧ダイジェスト          | b11804、ダイジェストdfe42bda81c6…               |
| Ubuntu 24.04 / 26.04  | 可変タグ                | 同系列の20260930.1 / 20261006相当のダイジェスト |

Dockerfile、Compose、開発環境の版指定、共有ロック、公開ツールの試験用データ、現行設計を同期した。更新した設計は既存の設計索引から辿れる。ポート、設定名、保存先、実行UID、プロファイルと起動依存は維持した。自前ビルドのタグは従来どおりとし、VectorとVictoriaLogsの明示版タグだけを更新した。

### 確認

- Docker HubとGHCRのマニフェストで新しい採用版とLinux amd64向け配布を確認した。イメージ本体の取得やビルドは行っていない。
- 配布サンプルを明示した標準構成、分散・管理構成、任意MediaMTX構成の`docker compose config --quiet`が成功した。シェルの`SINCRO_*`と`COMPOSE_*`を除外し、分散確認には検査用管理IP `192.0.2.1`を与えた。最初の分散確認は必須管理IP不足で失敗し、検査条件を補って解消した。
- Node 26.12.1 / npm 11.21.1の実行環境検査と本番ビルド、698試験が成功した。ビルドとの同時実行時は初期化試験1件が5秒制限に達したが、同じ版での単独再実行では全件成功した。時間制限や試験コードの変更は行っていない。
- Go 1.26.10の依存整合性、RTC全パッケージの既存試験、ログ監視の既存試験とバイナリビルドが成功した。
- uv 0.13.5の`uv lock --check`が成功した。Python更新の追加確認として、実MediaPipe 1.1.1のAudioClassifierを専用スレッドで生成し、既存YAMNetモデルと1秒の無音から2分類結果を取得して正常終了した。
- 公式Vector 0.60.0のLinuxバイナリで`vector validate --no-environment configs/vector.toml`と既存VRL試験7件が成功した。journalctl 258以降を要求する既存のUbuntu 26.04構成を維持した。
- イメージ公開ツールの既存5試験が成功した。実際のビルド・送信・タグ公開・パッケージ削除は行っていない。

### 見送り・未実行

CUDAは同系列の13.0.3を維持した。Python 3.15、Go 1.27、AgentServerのNode 26、npm 12への系列移行は今回の保守更新から除外した。VOICEVOXのEngine 0.26.0・Core 0.17.1とモデルの固定値は維持した。

SeaweedFSのソース最新リリース4.49には通常構成向けのDockerタグが存在せず、別構成のFoundationDBイメージだけが公開されていたため、通常タグが公開済みの4.48へ固定した。既存latestと4.48のダイジェストは一致した。

旧MinIOは公式Docker Hubの一覧が404、マニフェストが401となり、公開イメージを取得できなかった。標準構成には含まれない旧MinIOの基底イメージは更新・固定できておらず、旧構成の再ビルドはこの配布問題を解消する必要がある。別配布元や保存方式への移行は行っていない。

Dockerイメージの実ビルド・起動、AgentServerのNode 24.22.1実行、VOICEVOXのPython 3.14.9による実合成、llama.cpp・NeMoのGPU実推論と実ブラウザー確認は未実行。レジストリと構成の確認を実稼働確認として扱っていない。

### 容量と作成物

Docker接続先は`default`、ホスト`hatsune`、保存先`/var/lib/docker`、ビルダー`default`。開始時はイメージ78件・109GB、ビルドキャッシュ684件・130.9GB、ファイルシステムの空き122GBだった。完了時もイメージ78件・109GB、ビルドキャッシュ684件・130.9GBで増加はなく、空き容量は再確認した。Dockerイメージ・コンテナ・ビルドキャッシュは作成していないため、削除対象はない。Node、npm、Vectorの確認用配布物とログはリポジトリ外の`/tmp`へ配置した。

### 調査元

2026-10-24に[Docker Hub](https://hub.docker.com/)、[uv公式リリース](https://github.com/astral-sh/uv/releases)、[Node公式配布](https://nodejs.org/dist/index.json)、[Go公式配布](https://go.dev/dl/)、[SeaweedFS公式リリース](https://github.com/seaweedfs/seaweedfs/releases)、[Vector公式リリース](https://github.com/vectordotdev/vector/releases/tag/v0.60.0)を確認し、タグ・マニフェスト・依存条件と構成検査へ適用した。ダイジェスト固定は[Docker公式の説明](https://docs.docker.com/reference/cli/docker/image/pull/)に従った。
