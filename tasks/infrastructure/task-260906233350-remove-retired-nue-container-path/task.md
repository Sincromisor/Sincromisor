# 廃止済みNueのコンテナ選択導線を整理する

## 背景 / 目的

2026-09-06、HEAD `5bc93dcb1130fe339e4e114a7c2294dd97497463` を調査した。
[音声認識設計](../../../documents/design/backend/services/speech-recognizer.md)はNue-ASRを廃止済み・通常導線外とする。
一方、`examples/compose.env` は `nemo or nue` を案内し、Composeはモデル名からDockerfileを選ぶ。
Nue用Dockerfileが使う `speech-recognizer` グループはルート `pyproject.toml` に存在しない。
次の読み取り専用確認で、グループ未定義のエラーを再現した（終了コード2）。

```sh
UV_CACHE_DIR=/tmp/sincromisor-image-audit-uv uv sync --dry-run --offline --group speech-recognizer
```

根拠は再現済みのビルド前提不成立と現在の廃止方針である。
CUDA 12.6.3の更新やNueの復旧ではなく、動かない選択肢を現行導線から外す。

## 完了条件（受け入れ条件）

- [x] サンプル設定、README、Compose、初期化処理がNeMoだけを現行対応として扱う。
- [x] `nue` や未対応値で、黙ってNeMo起動やモデル取得・依存導入へ進まず、対応外と分かる失敗になる。
- [x] Nue用Dockerfileと現役Dockerfileの不要なNueメタデータCOPYを整理し、NeMoのビルドが成功する。
- [x] 正常なNeMo指定と未対応値1件で導線を確認する。

## 実装方針 / スコープ境界

主対象は `compose/speech-recognizer.yml`、`examples/compose.env`、`README.md`、
`Docker/service-initializer/initialize.sh`、`Docker/speech-recognizer-nue/Dockerfile`、
Nueメタデータをコピーする現役Python用Dockerfile。
`SINCRO_RECOGNIZER_MODEL` はNeMo指定を維持し、選択値を検証する最小の方法を採る。
初期化側の未対応値検出はモデル取得やS3操作より前に置く。
`git` はNeMoのReazonSpeech取得にも必要なため、Nueコメントを理由に一括削除しない。
旧Python実装、調査用スクリプト、過去タスク・設計アーカイブの全面削除は含めない。

## テスト

一時サンプルからComposeを展開し、NeMo用Dockerfileの選択を確認する。
未対応値で初期化が外部副作用より前に失敗する確認を残す。
変更シェルは `sh -n`、現役Python用DockerfileはCOPY元の存在と対象ビルドを確認する。
実モデルキャッシュやS3の既存データを変更しない。

## 文書同期 / 調査記録

音声認識設計、[Compose設計](../../../documents/design/infrastructure/compose.md)、READMEとサンプルを同期する。
以前案内されたNueを明示的に拒否するため、利用者向けには非互換の整理として記す。
起票時はdry-runで失敗を再現した。NueのDockerビルドとGPU認識は未実行。

## 実行記録

設定・Compose・初期化を同期する統合変更として、親が現在の作業ツリーで実装した。
NeMo以外をビルドの依存導入前と初期化の副作用前に拒否し、Nue用Dockerfileと
現役4種類にあるNueメタデータのコピーを削除した。ReazonSpeechの取得に必要なgitは維持した。

`docker compose --env-file examples/compose.env --profile full config --format json` を展開し、
音声認識のDockerfileがNeMo、ビルド引数が `nemo` であることを確認した。
`docker build -f Docker/speech-recognizer-nemo/Dockerfile --target builder --build-arg SINCRO_RECOGNIZER_MODEL=nue .` は
依存導入前の最初の `RUN` で対応外と表示して終了した。
`python3 tasks/infrastructure/task-260906233350-remove-retired-nue-container-path/artifacts/check_initializer.py` は
`nemo` のモデル取得経路と、`nue`・未知値・空値が外部操作前に失敗することを確認する。
`sh -n Docker/service-initializer/initialize.sh` と、変更した検証スクリプトのRuff検査・整形確認も成功した。
現役Python4種類のCOPY元は存在し、Nue以外の全ワークスペースのメタデータを維持している。

現役Python4種類をNueメタデータ除去後に再ビルドし、すべて成功した。
NeMoは `sincro-task:nemo-final` でモデル指定検証も含めてビルドを確認した。
CUDA更新側で判明した推論時の開発用ヘッダー不足は、CUDA更新タスク内で解消する。
実モデルキャッシュとS3の既存データは変更していない。文書・コメント点検はPASS。既知の残リスクはない。
