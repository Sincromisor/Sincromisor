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

- [ ] 採用版、モデルの識別情報、対応条件と根拠の参照先が記録され、未確認点と確認済みの結論が区別されている。
- [ ] 実験を行った場合は入力の識別情報、実行手順、通常認識との出力差を記録する。実音声などの非公開原本は公開成果物へ含めない。

## 非対象

モデル変更・再学習、ストリーミングの本番実装、音声区間やWebSocket契約の変更、VPS帯域の測定、Opus転送の変更。

## 文書と契約

設計の外部契約は変更しない。確認結果と判断はこのタスクへ記録する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [対応モデルの条件を調べるための資料。採用版での利用可否は本タスクで照合する](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/models.html#cache-aware-streaming-conformer)。
