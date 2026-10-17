# 確定音声の候補再試行でNeMoのエンコード結果を再利用する

## 背景 / 目的

確定音声では通常認識後に固有名詞補強とN-bestの再試行を行う場合がある。同じ音声を再びエンコードせず、先行タスクで分けたエンコード結果を一要求内で再利用する。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 先行タスク

- [task.md](../../../tasks/backend/task-261017195944-nemo-encode-decode-separation/task.md)（NeMo認識を前処理・エンコード・デコードへ分ける）

## 変更範囲

- [SpeechRecognizerNemo.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py)
- [SpeechRecognizerNemoWorker.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py)
- [test_speech_recognizer_nemo_worker.py](../../../sincromisor-server/speech-recognizer-nemo/tests/test_speech_recognizer_nemo_worker.py)

## 設計判断

- 一回のrecognizeがエンコード結果と有効長を所有し、通常認識と実際に必要になった再デコードだけへ渡す。別発話・別接続・暫定から確定への持越しはしない。
- 既存の補強機能の有効条件、曖昧候補がない場合の省略、補強採用後のN-best省略、候補順位付け、追跡記録を維持する。
- デコード設定の復元とGPUテンソルの参照解放を、成功・失敗・取消後の回収のいずれでも行う。共有モデルを同時実行しない。
- Workerの変更は通常結果から候補再試行へ同じエンコード結果を渡す範囲に絞り、辞書処理や保存処理の整理を混ぜない。

## 完了条件と確認方法

- [ ] 再試行する条件を試験で作り、通常・補強・N-bestを通っても一要求のエンコードが1回であることを確認する。
- [ ] 再試行しない場合、補強採用、補強不採用後のN-best、再デコード例外で従来の判断と設定復元を維持する。既存Worker試験を使う。
- [ ] 先行タスクと同じ実モデル・固定音声で補強経路の変更前後を比較し、認識結果、候補順位、スコアを確認する。実行時間は参考として記録し、根拠のない改善率を合否条件にしない。
- [ ] 文字列・候補順位の回帰や原因を説明できないスコア差があれば修正し、差を記録するだけで完了としない。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

暫定音声の差分推論、発話間キャッシュ、CUDA graphsの有効化、補強設定や辞書仕様の変更。

## 文書と契約

[speech-recognizer.md](../../../documents/design/backend/services/speech-recognizer.md)に変更後の所有者と処理の流れを反映する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [エンコーダー出力を受け取るrnnt_decoder_predictions_tensor](https://github.com/NVIDIA-NeMo/Speech/blob/v3.0.0/nemo/collections/asr/parts/submodules/rnnt_decoding.py)。
