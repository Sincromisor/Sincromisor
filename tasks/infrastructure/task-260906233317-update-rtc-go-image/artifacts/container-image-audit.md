# Composeを起点としたコンテナ更新調査

## 目的 / 調査範囲

2026-09-06、HEAD `5bc93dcb1130fe339e4e114a7c2294dd97497463` を基点に調査した。
`compose.yml` の有効なinclude全件、認識モデルで選ばれるNeMo/Nue、
コメントアウトされたMediaMTX、include外のMinIOを区別した。
参照されるDockerfileの全段階と、uv・mc・VOICEVOXなどの直接取得も確認した。
DifyとLLMはこのComposeに含まれず、ホスト上にある別プロジェクトのイメージは対象外。

調査と対応タスクの起票のみを行い、イメージ取得、ビルド、サービス再作成、データ移行は行っていない。
ローカルの未追跡ディレクトリ `volumes/proper-noun-dictionaries/` は変更していない。

## 更新判断

「配布版」は公式リリースで確認した候補であり、稼働イメージの内部OSパッケージがすべて最新という意味ではない。
`latest` やメジャー番号タグは可変で、定義の同一性だけでは更新済みと判断できない。

| 対象                         | 定義 / 稼働版                                                      | 確認した配布版・状態                     | 対応                                                                              |
| ---------------------------- | ------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------- |
| RTCのGo                      | `golang:1.26.5-bookworm`、go.modも1.26.5                           | 1.26.8。1.26.6以降に修正あり             | Dockerfileと最低Go版更新を起票                                                    |
| VOICEVOX                     | Dockerfileの取得版0.24.1                                           | 安定版0.25.2                             | 版と取得処理の更新を起票                                                          |
| NeMo                         | ベースCUDA 12.9.1、稼働PyTorch 2.9.1+cu128                         | ロックはPyTorch 2.13.0 / CUDA 13.0.3系   | CUDA基盤の更新と現在ロックの動作確認を起票                                        |
| Nue                          | CUDA 12.6.3、依存グループ未定義                                    | 現行設計では廃止済み                     | 選択導線整理を起票。CUDA版更新は不要                                              |
| Consulサーバー・エージェント | `hashicorp/consul:latest`、確認したサーバーは2.0.3                 | 2.0.3                                    | サーバーの製品版更新は不要                                                        |
| コピーされたConsul           | フロントとRedis内は2.0.2                                           | 2.0.3に修正あり                          | 両イメージをベース再取得付きで再ビルド。VOICEVOX内も確認対象                      |
| Caddy                        | `caddy:latest`、稼働2.11.4                                         | 2.11.4                                   | 製品版更新不要。フロントの再ビルド時にベースを再取得                              |
| Redis                        | `redis:8`、稼働8.10.0                                              | 8.10.1にセキュリティ修正                 | 優先してベース再取得・派生イメージ再ビルド。定義変更は必須でない                  |
| SeaweedFS                    | 5サービスが無指定またはlatest、稼働masterは4.42                    | 4.45                                     | 5サービスを同じ取得済み版へ揃える運用更新。保存データの退避・互換確認後に実施     |
| curlのConsul登録役           | `curlimages/curl:latest`、稼働8.21.0                               | 8.22.0                                   | イメージ再取得・登録役再作成で対応可能                                            |
| Node.js                      | フロントとRTCが `node:22`                                          | 22系はLTS継続、24系もLTS                 | 22系内のベース再取得で対応。24系移行を必須タスクにはしない                        |
| Ubuntu                       | 初期化・RTC実行・音声抽出・テキスト処理・音声合成・VOICEVOXが24.04 | 24.04 LTSはサポート中                    | ベースとaptパッケージの再取得を行う。26.04移行は不要                              |
| MediaMTX                     | コメントアウト、`bluenviron/mediamtx:latest`                       | v1.21.0                                  | 使用時に再取得とRTMP疎通確認。現行構成の変更タスクは不要                          |
| MinIO                        | include外、`minio/minio:latest`                                    | 公式はソース配布のみ・リポジトリ保管状態 | 現行S3はSeaweedFSなので更新タスクなし。再有効化時は現定義のまま更新可能と考えない |

## Dockerfileの定義更新

| タスク                                                                           | 最小の変更                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [RTCのGo更新](../task.md)                                                        | 1.26.8-bookwormとgo.modの最低版を同期                         |
| [VOICEVOX更新](../../task-260906233317-update-voicevox-engine-image/task.md)     | CPU版0.25.2へ更新し、不完全ダウンロードのキャッシュ残存を防ぐ |
| [ロック遵守](../../task-260906233317-lock-container-dependency-install/task.md)  | npm ciとPythonのロック不整合検出、起動時の再同期回避          |
| [Nue導線整理](../../task-260906233350-remove-retired-nue-container-path/task.md) | 廃止済み選択肢と不要なDockerfile参照を整理                    |
| [NeMoのCUDA基盤更新](../../task-260906233317-align-nemo-cuda-image/task.md)      | CUDA 13.0系の両段階を揃え、現在ロックでGPU認識を確認          |

ロック遵守は不整合時の暗黙再解決を防ぐ定義改善であり、正常ロックから毎回違う依存を導入する不具合を再現したという意味ではない。
NeMoもベースとPyTorchのCUDA世代が異なることだけで故障と判断しない。
稼働中はGPU利用可能であり、更新後の構成をビルドして確認する必要がある。

初期化用のmcは版のない配布URL、uvはインストーラー、Hugging Face CLIは `uv tool install huggingface-hub` で取得する。
再ビルドで更新を取り込めるが、既存のビルドキャッシュがあればRUNが再実行されない場合がある。
これらの全面固定や新しい更新管理基盤は今回の必須変更としない。再ビルド時に `mc --version`、`uv --version`、`hf version` と初期化の主要操作を確認する。
個別Python/npm依存の最新版調査や、全イメージの脆弱性走査は対象外。

## 運用更新時の注意点

イメージを直接使うConsul、SeaweedFS、curlは再取得後の再作成、
DockerfileのベースやCOPY元を使うRedis・フロント・VOICEVOXは `build --pull` による再ビルドが必要。
aptや直接取得のRUNまで確実に再実行する場合は、その段階のキャッシュを無効化する。
自前の `ghcr.io/sincromisor/*:latest` というタグ名だけを変更しても、内包版は更新されない。
この調査では操作していない。実施時は影響サービスの疎通確認を行う。

SeaweedFSはmaster・volume・filer・s3・bootstrapの版を揃え、既存保存領域の退避と更新手順を先に確認する。
データ削除を伴う再初期化を更新手順にしない。
Consulはサービス用コンテナのほか、DockerfileでコピーされるCLIの版も確認する。

## 実行した確認 / 限界

- Compose、Dockerfile、サンプル設定、初期化・登録スクリプト、依存宣言、ロック、現在設計、既存タスク索引を読んだ。
- Dockerのイメージ一覧・稼働サービス一覧と、対象サービスの版表示コマンドを実行した。
- NeMo内でPyTorch版・CUDA版・GPU利用可否を読み取った。認識モデルの推論は実行していない。
- ホストのGPUはGeForce RTX 5060 Ti、ドライバー610.88だった。
- `uv sync --dry-run --offline --group speech-recognizer` はグループ未定義で終了コード2。リポジトリの環境・依存は同期していない。
- Docker Hub公開APIで `golang:1.26.8-bookworm`、`redis:8`、SeaweedFS/curlのlatest、CUDA 13.0.3候補タグの存在を確認した。
- 更新タグの存在と公式リリースは確認したが、候補イメージのレイヤー取得・起動・互換試験は未実行。全内包パッケージの更新要否は未判定。

## 公式根拠（参照日: 2026-09-06）

起票成果物は `npm run tasks:index:check`、`npm run tasks:check`（363件）、
変更MarkdownのPrettier確認、`git diff --check` に合格した。
5件とも `status: open` で、実装・完了処理・コミットは行っていない。

- [Go変更履歴](https://go.dev/doc/devel/release): 1.26系の修正版。
- [VOICEVOX 0.25.2](https://github.com/VOICEVOX/voicevox_engine/releases/tag/0.25.2)、[0.25.0](https://github.com/VOICEVOX/voicevox_engine/releases/tag/0.25.0): 安定版と変更内容。
- [Consul 2.0.3](https://github.com/hashicorp/consul/releases/tag/v2.0.3): 修正内容と最新公開版。
- [Redis 8.10.1](https://github.com/redis/redis/releases/tag/8.10.1): セキュリティ修正。
- [SeaweedFS 4.45](https://github.com/seaweedfs/seaweedfs/releases/tag/4.45)、[curlコンテナ8.22.0](https://github.com/curl/curl-container/releases/tag/8.22.0): 更新候補。
- [Caddy 2.11.4](https://github.com/caddyserver/caddy/releases/tag/v2.11.4)、[MediaMTX v1.21.0](https://github.com/bluenviron/mediamtx/releases/tag/v1.21.0): 公開版。
- [Node.jsリリース状況](https://nodejs.org/en/about/previous-releases)、[Ubuntuリリース周期](https://ubuntu.com/about/release-cycle): 既存系列の継続利用判断。
- [NVIDIA CUDA互換表](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html): ホストドライバーとCUDA系列。
- [MinIO公式](https://github.com/minio/minio): ソース配布と保管状態。
- [uvのDocker手順](https://docs.astral.sh/uv/guides/integration/docker/)、[npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/): ロックを使う導入手順。
- [Docker HubのGoタグ情報](https://hub.docker.com/v2/repositories/library/golang/tags/1.26.8-bookworm)、[CUDAタグ情報](https://hub.docker.com/v2/repositories/nvidia/cuda/tags/13.0.3-cudnn-runtime-ubuntu24.04): 候補の配布確認。
