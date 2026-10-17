# NeMo認識を前処理・エンコード・デコードへ分ける

## 背景 / 目的

SpeechRecognizerNemo.transcribeはmodel.transcribeをまとめて呼び、確定時の候補再試行でも同じ音声をエンコードする。出力再利用の前段として、一回の認識を段階別に扱える最小の内部境界を作る。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [SpeechRecognizerNemo.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py)
- [test_speech_recognizer_nemo_worker.py](../../../sincromisor-server/speech-recognizer-nemo/tests/test_speech_recognizer_nemo_worker.py)

## 設計判断

- 既存のnorm_audio・pad_audio・PAD_SECONDS、入力サンプルレート、特徴量前処理、eval/inference状態、デバイスとdtypeを採用NeMo/ReazonSpeech実装と照合し、一回の認識で同じ処理を行う。
- エンコーダー出力と有効長をデコードへ渡す小さな内部関数に分ける。新しい汎用推論基盤や設定クラスは作らない。
- この段階は一要求内で一回エンコード・一回デコードする。既存transcribe、transcribe_with_score、transcribe_candidatesの呼出元と結果形式は維持する。
- 通常候補とN-best、decode_hypothesis、例外時のchange_decoding_strategy復元を維持する。ライブラリの非公開メソッドの丸ごと複製を避ける。

## 完了条件と確認方法

- [ ] 既存Worker試験と段階別の小さな試験で、音声前処理、候補形式、設定復元を確認する。
- [ ] 採用NeMo 3.0.0とReazonSpeechを使う既存CUDA検証環境で、同じ固定音声に対する変更前後の通常認識とN-bestの文字列・順位・スコアを比較する。数値差があれば原因と許容根拠を記録する。
- [ ] 文字列・候補順位の回帰や原因を説明できないスコア差があれば修正し、差を記録するだけで完了としない。
- [ ] モデルの初期化・推論・後始末が成功することを確認する。実モデル確認ができない場合は同値性を未確認と記録し、この条件を満たした扱いにしない。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

エンコーダー出力の再利用、ストリーミング化、モデル変更、デコード戦略の調整、Worker全体の分割。

## 文書と契約

[speech-recognizer.md](../../../documents/design/backend/services/speech-recognizer.md)に変更後の所有者と処理の流れを反映する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [採用版の前処理・エンコードと出力処理の分離](https://github.com/NVIDIA-NeMo/Speech/blob/v3.0.0/nemo/collections/asr/models/rnnt_models.py)。
