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

- [ ] ビルド段階と実行段階を、現在の依存が使うCUDA 13.0系・Ubuntu 24.04の同一イメージへ更新する。
- [ ] 現在のロックによるビルドが成功し、PyTorch、CUDA、cuDNNの実版を記録する。
- [ ] GPU利用、日本語短音声1件のNeMo認識、既存の死活確認に成功する。
- [ ] 採用CUDA系統とホストドライバー条件を導入文書へ反映する。

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
