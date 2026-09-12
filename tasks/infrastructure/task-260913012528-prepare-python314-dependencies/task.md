# Python 3.14移行に必要な音声処理依存を更新する

## 背景 / 目的

Python 3.14への更新要求に先立ち、2026-09-13時点の公開依存と一時環境を調査した。NumPy 1.26.4の固定を外すだけでは導入できず、NeMoとSudachiPyの更新も必要だった。

| 対象                | 調査結果                                                                                                                                                                     | 対応                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| NumPy               | [2.3.3](https://pypi.org/project/numpy/2.3.3/)にはCPython 3.14用配布物がある                                                                                                 | 現行ワークスペースの1.26.4固定を`>=2.3.3,<3`へ更新                                                                 |
| ReazonSpeech        | [固定コミットの依存](https://github.com/reazon-research/ReazonSpeech/blob/5a120830a2240f0237a153c081c995c767fc6d02/pkg/nemo-asr/pyproject.toml)はNumPy上限なし、NeMo >=2.6.1 | Git参照を維持                                                                                                      |
| NeMo                | [2.6.2](https://pypi.org/pypi/nemo-toolkit/2.6.2/json)のASR依存はkaldialign <=0.9.1。3.14では0.8.0へ戻り、ソースビルドが失敗                                                 | [3.0.0](https://pypi.org/pypi/nemo-toolkit/3.0.0/json)は上限を解除し、3.14用wheelのあるkaldialign 0.12.0で導入成功 |
| SudachiPy           | 0.6.10は3.14用wheelがなくRustビルドが必要になり失敗                                                                                                                          | 0.6.11へ更新すると導入成功                                                                                         |
| MediaPipe / PyTorch | 0.10.32 / 2.13.0のまま3.14で導入・import成功                                                                                                                                 | 維持                                                                                                               |

一時環境ではPython 3.14.7、NumPy 2.5.3、NeMo 3.0.0、Numba 0.67.0、llvmlite 0.49.0、SudachiPy 0.6.11で依存導入と主要ライブラリのimportが成功した。MediaPipeの音声デバイス初期化はサンドボックス内で停止したが、外側では正常終了した。

## 完了条件（受け入れ条件）

- [x] Python 3.12を維持したまま、現行サービスのNumPy・NeMo・SudachiPyを移行可能な版へ更新し、ロックした依存を導入できる。
- [x] 既存のPythonテストとMediaPipeの音声分類、ReazonSpeechの読み込みを確認する。

## スコープ境界

ルートと現行ワークスペースの依存宣言、uv.lockを対象とする。廃止済みNue-ASRは現行ワークスペース・Composeの対象外のため変更しない。Python指定の切り替えは[後続タスク](../task-260913012528-upgrade-python314/task.md)で行う。

## 実装方針

NumPyの範囲とSudachiPyの下限を更新し、直接利用しているNeMoを`>=3.0.0,<4`として明示する。依存の制約を強制的に上書きせず、必要なパッケージだけロックを更新する。

## テスト

`uv sync --locked --group dev --group full`、現行Pythonサービスの既存pytest、YAMNetによる無音分類、NeMo / ReazonSpeechのimportを実行する。モデル取得を伴うGPU推論の未確認範囲は記録する。

## ドキュメント同期の要否

通信契約は変更しない。依存更新と調査結果は本タスクに記録し、実行環境の文書は後続タスクで同期する。

## 実施結果

- Python 3.12.12で`uv sync --locked --group dev --group full`が成功した。
- `uv run --no-sync pytest sincromisor-server/sincro-models/tests sincromisor-server/text-processor/tests sincromisor-server/speech-recognizer-nemo/tests -q`は28件成功した。Go生成のmsgpackをPythonで読む互換性確認も含む。
- NumPy配列とTorchの往復、MediaPipe 0.10.32のYAMNet分類で`Silence`を確認した。NeMo / ReazonSpeechとサービスの認識クラスを読み込めた。
- NeMo更新で不要になった推移依存をロックから削除した。PyTorch 2.13.0とCUDA依存は更新前のロックから維持している。
- GPUでのモデル読み込み・推論は後続タスクで確認する。既存テストのSWIG非推奨警告が残る。
