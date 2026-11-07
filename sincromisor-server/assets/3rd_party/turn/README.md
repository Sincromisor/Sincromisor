# 発話判定モデルと特徴量処理

重みはGitへ含めず、SpeechExtractorのモデル準備コマンドで事前取得する。版・URL・SHA-256の正本は[model_assets.py](../../../speech-extractor/src/speech_extractor/model_assets.py)。取得時と起動時の両方で検証し、起動時には外部へ取得しに行かない。閉域環境では準備済みファイルを同じ配置へコピーする。

| 資材                | 固定版                                             | ライセンス                                                          |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| Silero VAD ONNX     | v6.2 / be95df9152c0d7618fa1edfeb296fc3dae32376f    | [MIT](SILERO-LICENSE)                                               |
| Smart Turn CPU ONNX | v3.2 / f766f81d3cfdf7737ac64aad813d91bbfd56bf93    | [BSD-2-Clause](SMART-TURN-LICENSE)                                  |
| Whisper特徴量処理   | Pipecat / 3b2dccd843c65d1632631ceac248a5128fb32242 | [BSD-2-Clause](PIPECAT-LICENSE)、派生部分は[Apache-2.0](APACHE-2.0) |

特徴量処理は[公式原本](https://github.com/pipecat-ai/pipecat/blob/3b2dccd843c65d1632631ceac248a5128fb32242/src/pipecat/audio/turn/smart_turn/_whisper_features.py)の数値演算を維持し、説明を日本語化・整形している。著作権表示は原文を保持する。モデルを更新する場合は入力・出力と特徴量一致、実音声の途中確定・欠落を再評価する。
