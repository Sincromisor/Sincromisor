# 現行ReazonSpeechでNeMoの逐次認識を利用できるか調査する

## 背景 / 目的

現行認識は発話の累積音声を毎回推論する。NeMoのキャッシュ対応ストリーミングは重複計算を減らせるが、対応するエンコーダーと学習条件が必要であり、採用ReazonSpeechへの適用は未確認である。実装を大きくしないため、まず適用可否だけを調べる。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [SpeechRecognizerNemo.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py)
- [pyproject.toml](../../../sincromisor-server/speech-recognizer-nemo/pyproject.toml)
- [uv.lock](../../../uv.lock)

## 設計判断

- uv.lockが指定するNeMoとReazonSpeechのソース、およびload_modelが読むモデル設定を確認する。nightly文書のAPIが採用版にもあると仮定しない。
- キャッシュ対応に必要なエンコーダー、右文脈、学習条件、デコード方式と現在のモデルを照合し、適用可能・条件付き・非対応を根拠付きで判定する。
- 設定とソースで非対応が確定した場合は調査結果を記して完了できる。適用可能性がある場合だけ固定音声の最小実験で接続方法と出力の差を確認する。
- 結果はこのtask.mdへ記録する。実装可能なら次の最小変更範囲を示すが、本タスクで本番切替や新モデルの採用を行わない。

## 完了条件と確認方法

- [x] 採用版、モデルの識別情報、対応条件と根拠の参照先が記録され、未確認点と確認済みの結論が区別されている。
- [x] 実験を行った場合は入力の識別情報、実行手順、通常認識との出力差を記録する。実音声などの非公開原本は公開成果物へ含めない。

## 非対象

モデル変更・再学習、ストリーミングの本番実装、音声区間やWebSocket契約の変更、VPS帯域の測定、Opus転送の変更。

## 文書と契約

設計の外部契約は変更しない。確認結果と判断はこのタスクへ記録する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [対応モデルの条件を調べるための資料。採用版での利用可否は本タスクで照合する](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/models.html#cache-aware-streaming-conformer)。

## 実装・確認結果

採用版の設定・ソースから、現在の認識条件を維持した逐次認識への直接移行は非対応と判定した。本番コードと外部契約は変更していない。

### 採用版とモデル

- uv.lock: `nemo-toolkit==3.0.0`、`reazonspeech-nemo-asr==3.0.0`。ReazonSpeechの固定コミットは `2d4d4762e7ee294ac8e47a177ac2e9b0e8d0d43f`。
- 採用ReazonSpeechの `load_model()` は `EncDecRNNTBPEModel.from_pretrained("reazon-research/reazonspeech-nemo-v2")` を呼ぶ。
- 実機キャッシュのモデルrevisionは `33693408be76b7cba9fd4a7546a0a8772430211b`。`.nemo` の内容識別子は `d196d43ad03466ca88beeda4bf5fafb07bab7202d4b663b8e4f12cb0a4381fae`。tar内の `model_config.yaml` を直接読み、設定記録の `nemo_version: 1.21.0` と実行ライブラリ3.0.0を区別した。モデル名のmain参照自体は将来変化し得る。

### 判定

**現在のモデル・認識結果・デコード方式を維持した逐次認識への直接移行は非対応。** NeMoにキャッシュAPIがあることと、現行経路をそのまま置換できることは別である。

| 観点             | 採用モデル・ソースの確認結果                                                                                                                                                              | 判断                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| エンコーダー     | `ConformerEncoder`、24層、8倍間引き、`rel_pos_local_attn`、`global_tokens: 1`。NeMo3.0.0には `get_initial_cache_state`、`cache_last_channel/time/len` がある                              | APIの存在は確認。全体参照トークンを含む現在の計算を短いチャンクで同一にはできない                                                                                                                  |
| 右文脈           | attention `[128,128]`、`regular`、kernel9、`conv_context_size: null`（ソースで左右4へ展開）、`causal_downsampling: false`                                                                 | `setup_streaming_params` の通常右文脈計算は `(128+4)*24=3168` エンコーダーフレーム。10ms×8倍で253.44秒相当となり、会話の低遅延化へ直接使う設定ではない。この値は設定からの算出で、実測遅延ではない |
| 前処理・学習条件 | `normalize: per_feature`、上記の右文脈・全体参照を保存したモデル。短い右文脈や因果畳み込みでの学習を示す設定はない                                                                        | 正規化範囲や右文脈を縮めると従来との同一性を失う。別条件での精度は未確認                                                                                                                           |
| デコード         | 保存済み既定方式は `alsd`。採用NeMoの `BeamRNNTInfer.align_length_sync_decoding` は `partial_hypotheses` が指定されると `NotImplementedError`。候補再試行に使うバッチbeamも部分仮説未対応 | 現行方式の状態を継続する逐次デコードは非対応。別方式へ切り替えるなら結果・スコア・候補順位の再評価が必要                                                                                           |

ソースと設定で現行方式の直接移行を否定できるため、本タスクでは固定音声の逐次実験を行わなかった。既存の累積音声認識を維持する。キャッシュAPIを強制的に呼べるか、別のデコード方式や大きな重複チャンクでどの程度の精度になるかは未確認であり、適用可能とは判定していない。モデル変更・再学習を含む検討は今回の範囲外で、追加実装タスクは起票しない。

### 確認手順と参照先

- `sincro-deps-python:verify` 内の採用版ソース `nemo/collections/asr/modules/conformer_encoder.py` の `setup_streaming_params` と文脈設定、`parts/submodules/multi_head_attention.py` の局所注意、`parts/submodules/rnnt_beam_decoding.py` の部分仮説拒否を確認した。
- モデルキャッシュの `refs/main`、該当snapshotの `.nemo` を `tarfile.open` で開き `model_config.yaml` を読み出した。学習音声・認識音声は出力していない。
- [固定ReazonSpeechソース](https://github.com/reazon-research/ReazonSpeech/tree/2d4d4762e7ee294ac8e47a177ac2e9b0e8d0d43f/pkg/nemo-asr)、[確認したモデルrevision](https://huggingface.co/reazon-research/reazonspeech-nemo-v2/tree/33693408be76b7cba9fd4a7546a0a8772430211b)。
- [NeMo公式のキャッシュ対応条件](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/models.html#cache-aware-streaming-conformer)は、学習と推論の右文脈を合わせる条件の参考として確認した。採用版の可否は上記ローカルソースで判定した。
