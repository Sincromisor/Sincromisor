# Dockerの不要なビルド入力とPythonのコピー範囲を削減する

## 背景 / 目的

2026-10-18、HEAD `d9e4916b` のDockerビルドを調査した。`.dockerignore` がなく、Pythonの4イメージが `sincromisor-server` 全体をコピーしている。
調査時のAgentServer配下には `node_modules` 約451MB、`.mastra` 約323MBがあり、ローカルビルドの取り込み対象になる。別サービスの変更も後続の依存同期を無効化する。
これらはホスト上の実測値であり、既存イメージへの混入や削減量を実証した値ではない。公開スクリプトの `git archive` では未追跡生成物は入らない。

## 完了条件

- [x] ビルドコンテキストからローカル依存、仮想環境、キャッシュ、ログ、秘密設定、保存領域を除外し、必要な入力は残す。
- [x] Pythonの4イメージは、全ワークスペースの依存検証に必要な宣言と、対象サービス・共通パッケージ・実行用素材を選んでコピーする。AgentServerやGoサービスのソース・生成物は含めない。
- [x] `uv sync --locked`、サービス別依存グループ、起動時の `--no-sync`、実行UIDとパスを維持し、必要なモジュールと素材を利用できる。
- [x] AgentServerのソースだけの変更でPython側のソースコピー以降が無効化されないことを確認する。

## 変更範囲・実装方針

対象はルートの `.dockerignore`、必要な個別コンテキストの除外設定、`Docker/{speech-extractor,speech-recognizer-nemo,text-processor,voice-synthesizer}/Dockerfile`。
[依存定義](../../../pyproject.toml)のワークスペース・ルートパッケージと各起動スクリプトを確認してコピー範囲を決める。すべてのメンバーの `pyproject.toml` がロック検証に必要な点に注意する。
`README.md`、`.python-version`、YAMNetなどの必要素材を一括除外しない。フロントの素材生成・コピーもルート除外設定の利用側として確認する。
依存版更新、パッケージ構造の再設計、モデルキャッシュの保存方式変更は含めない。

## 確認方法

- 対象Dockerfileの入力を一覧で確認し、ローカル生成物を含めないことと必要ファイルが残ることを検査する。実際の秘密ファイルを検証用にコピーしない。
- Pythonの変更した4イメージを各1回ビルドし、対象モジュールの読み込み、起動スクリプトと素材の存在を確認する。speech-extractorの既存モデル初期化検査を維持する。
- 小さいPythonイメージ1件で、AgentServerだけを変更した一時コンテキストから再ビルドし、該当ステップのキャッシュ再利用を確認する。
- ルート除外設定の影響を受けるフロント・RTCなどは必要入力の確認を行い、入力欠落の懸念が残る対象に限って追加ビルドする。速度や削減容量に未実測の数値目標は設けない。

## 文書同期・実行上の制約

通信契約や起動設定は変更しない。入力の選別方針は [Compose設計](../../../documents/design/infrastructure/compose.md) の関連箇所へ必要な範囲で反映する。
ビルド前の容量確認、作成物の記録と後片付けは [Docker Compose管理ルール](../../../documents/rules/docker-compose.md) に従う。起票時点では改善後のビルドは未実施。

## 実装・確認結果

ルートとAgentServerの.dockerignoreを追加し、ローカル依存・生成物・秘密設定・保存領域を除外した。Pythonは全メンバーの宣言を残し、対象サービス、sincro-config、sincro-modelsだけをコピーする。speech-extractorにはYAMNet素材も配置し、NeMo実行段階にはbuilderの宣言を引き継ぐ。Compose設計と索引からの導線を確認した。

Python4イメージのビルド、uv sync --locked、対象モジュールと共通パッケージの読み込み、UID 1001、起動スクリプトを確認した。MediaPipe分類器初期化も成功した。架空の.env・仮想環境・node_modules・.mastra・保存データを一時入力へ置き、Dockerによる除外と必須入力の残存を確認した。ルートコンテキストを使う全DockerfileのCOPY入力も確認した。実秘密ファイルは使っていない。

同じ一時入力のAgentServerソースだけを変更してtext-processorを再ビルドし、ソースCOPYと両uv syncがCACHEDになることを確認した。依存版・実行パス・起動コマンドは維持した。GPU推論は未実施。コメント点検: PASS。

defaultビルダー、unix:///var/run/docker.sock、linux/amd64で--output type=cacheonlyを使用し、イメージタグ・ID・永続コンテナは新規作成していない。キャッシュは114.3GBから114.5GBへ約0.2GB増加、空き142GB。既存GCの下で後続・通常ビルドに再利用する。
