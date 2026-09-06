# NeMoコンテナのCUDA基盤を現在の依存構成に合わせる

## 背景 / 目的

2026-09-06、HEAD `5bc93dcb1130fe339e4e114a7c2294dd97497463` を調査した。
[Dockerfile](../../../Docker/speech-recognizer-nemo/Dockerfile)の両段階は
`nvidia/cuda:12.9.1-cudnn-runtime-ubuntu24.04` を指定する。
現在の `uv.lock` はPyTorch 2.13.0、`cuda-toolkit 13.0.3.0`、`nvidia-cudnn-cu13` を含む。
稼働コンテナはPyTorch `2.9.1+cu128`、CUDA `12.8`、GPU利用可であり、
その成功は現在のロックによる再ビルドを保証しない。

ユーザーの更新要求を根拠に、CUDA 13系の依存に合わせてビルド・実行基盤を更新する。
世代の相違だけで故障とは断定しない。PyTorch配布ライブラリとホストドライバーの互換性も確認する。

## 完了条件（受け入れ条件）

- [x] ビルド段階と実行段階を、現在の依存が使うCUDA 13.0系・Ubuntu 24.04の同一イメージへ更新する。
- [x] 現在のロックによるビルドが成功し、PyTorch、CUDA、cuDNNの実版を記録する。
- [x] GPU利用、日本語短音声1件のNeMo認識、既存の死活確認に成功する。
- [x] 採用CUDA系統とホストドライバー条件を導入文書へ反映する。

## 実装方針 / スコープ境界

候補は `nvidia/cuda:13.0.3-cudnn-runtime-ubuntu24.04`。
Docker Hub公開APIでタグの存在を確認済み（2026-04-14更新）。
[NVIDIA互換表](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html)と照合する。
調査ホストはGeForce RTX 5060 Ti、ドライバー610.88。ホストドライバーの自動更新は行わない。

主対象はDockerfileと導入文書。PyTorchを古いベースに合わせて戻さない。
ビルドや認識で不整合が出た場合だけ原因となる依存宣言とロックを最小限修正する。
CUDA最新版への無条件追従、NeMoモデル変更、対応GPUの網羅試験、複数アーキテクチャ対応は含めない。
依存導入方法は [ロック遵守タスク](../task-260906233317-lock-container-dependency-install/task.md)が扱うため重複変更を調整する。

## テスト

一時タグでビルドし、一時コンテナから `torch.__version__`、`torch.version.cuda`、
`torch.backends.cudnn.version()`、`torch.cuda.is_available()` を確認する。
認識モデルで短音声1件を処理し、Composeと同じ `/api/v1/SpeechRecognizer/statuses` を確認する。
稼働サービスの差し替え、共有キャッシュ削除、ホスト設定変更は行わない。

## 文書同期 / 調査記録

README、[Compose設計](../../../documents/design/infrastructure/compose.md)、
[音声認識設計](../../../documents/design/backend/services/speech-recognizer.md)の必要箇所を同期する。
起票時は定義・ロック・配布タグと稼働版の読み取りのみ。
更新後のビルド・認識は未実行で、CUDA 12系イメージの不具合を再現したものではない。

## 実行記録

通常変更として親がビルド・実行段階をCUDA 13.0.3へ更新した。
ロック遵守とNue整理の変更も含むイメージで確認し、依存宣言・ロック・認識モデルは変更していない。

GPU確認ではPyTorch `2.13.0+cu130`、`torch.version.cuda=13.0`、
`torch.backends.cudnn.version()=92000`、`torch.cuda.is_available()=True` を得た。
GeForce RTX 5060 Ti、ドライバー610.88でGPU上のテンソル演算も成功した。
日本語推論ではTritonのC拡張生成に必要なCコンパイラーとPythonヘッダーの不足を再現したため、
実行段階へ `gcc` と `python3-dev` を追加した。詳細は [実装時の補完](impl.md) を参照する。

検証用ネットワーク `sincro-task-net` に一時Consulを起動し、モデルキャッシュは
`volumes/sincro-cache/huggingface/hub` を `/models:ro` へマウントして
`HF_HUB_CACHE=/models` と `HF_HUB_OFFLINE=1` を指定した。
uv・Tritonの書込み用キャッシュはコンテナ内に作り、共有キャッシュを変更していない。
`SINCRO_CONSUL_AGENT_HOST=sincro-task-consul` と
`SINCRO_RECOGNIZER_PUBLIC_BIND_HOST=sincro-task-nemo` を指定し、ホストへポートを公開せず検証した。

日本語確認は同梱の `sample02_f32le.raw`（16,000Hz、85,504サンプル）を使い、
次のコマンドでWebSocketを通して確定結果を取得する。

```sh
docker exec -i sincro-task-nemo uv run --no-sync python - < tasks/infrastructure/task-260906233317-align-nemo-cuda-image/artifacts/check_recognition.py
docker exec sincro-task-nemo curl --fail --silent --show-error http://localhost:8003/api/v1/SpeechRecognizer/statuses
```

不足依存の導入後、挨拶・降雪・寒さを述べる認識結果を得た。死活確認も終了コード0、
`worker_type=SpeechRecognizer`、`sessions=0` となった。

`docker build -f Docker/speech-recognizer-nemo/Dockerfile -t sincro-task:nemo-complete .` が成功した。
追加の手作業なしで新規コンテナを起動し、GPU演算・日本語認識・Consul登録・死活確認を再確認した。
新規コンテナでも同じ認識結果を得た。検証用コンテナとネットワークは撤去した。
文書・コメント点検はPASS。稼働サービスと共有モデルキャッシュは変更していない。
通常変更のため全体ゲート・独立レビューは対象外。既知の残リスクはない。
