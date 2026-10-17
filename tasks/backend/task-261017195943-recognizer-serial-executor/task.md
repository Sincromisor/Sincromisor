# 共有NeMoモデルの直列実行を保って認識待ちを分離する

## 背景 / 目的

SpeechRecognizerNemoProcessは共有WorkerのrecognizeをasyncなWebSocket処理から直接呼ぶ。推論と保存処理がイベントループを占有する一方、共有モデルは再デコードで設定を書き換えるため並列実行できない。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [SpeechRecognizerNemoProcess.py](../../../sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py)
- [SpeechRecognizerNemoWorker.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py)
- [SpeechRecognizerNemo.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py)
- [SpeechRecognizerS3Client.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerS3Client.py)
- [audio_encoder.py](../../../sincromisor-server/sincro-models/src/sincro_models/audio_encoder.py)

## 設計判断

- サービスが所有する一つの実行スレッドで共有Workerを扱い、初期化・recognize・終了処理の所有者をそろえる。接続ごとのモデル複製やGPU推論の並列化はしない。
- 複数接続の認識も一件ずつ実行する。次の受信と音声バッファ更新はその接続の実行完了後とし、未開始の取消済み要求をモデルへ渡さない。
- 親の取消で実行中のスレッドが止まるとは扱わない。モデル設定の復元と実行終了まで所有を保ち、実行中のS3クライアントを閉じない。取消された接続へ結果を返さない。
- 同期待機中も状態確認を受け付ける。終了時は新規投入を止めて実行を回収する。保存I/Oの有限待機を確認し、推論の強制停止や新しい自動再試行は設けない。
- 保存I/Oには認識音声を保存するopusencの待機も含む。共有audio_encoderに有限待機が未実装なら呼出元を確認して追加し、音声合成タスクで実装済みなら同じ処理を利用する。

## 完了条件と確認方法

- [x] 2接続の試験で認識処理の同時実行数が1を超えず、推論中も同一イベントループの処理が進む。
- [x] 待機中と実行中の取消、および認識失敗で、次要求へのデコード設定の漏れ・資源の早期解放がない。
- [x] 既存test_speech_recognizer_nemo_worker.pyを通す。実NeMoを利用できる既存CUDA検証環境で、ローカルWebSocketから一つの固定音声を認識し、スレッド移行後の推論と終了を確認する。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

認識モデル・辞書の変更、音声の差分推論、エンコーダー出力再利用、受信バッファの最適化、HTTPやmsgpackの契約変更。

## 文書と契約

[speech-recognizer.md](../../../documents/design/backend/services/speech-recognizer.md)に変更後の所有者と処理の流れを反映する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [非同期処理と実行スレッドの境界](https://docs.python.org/3.14/library/asyncio-task.html#running-in-threads)。

## 実装・確認結果

共有Workerの生成・認識・解放を1本の実行スレッドへ移した。取消された未開始要求は実行せず、実行中要求は繰り返しの取消でも回収してから接続のS3クライアントを閉じる。S3は接続5秒・読取り30秒・1試行、共通の外部符号化は30秒とし、ローカルI/Oの異常で終了待ちを無期限にしない。GPU推論は強制停止しない。

ロック済みCUDA検証イメージで既存Workerを含む14試験と2サブテスト、対象Ruff・tyが成功した。既存モデルキャッシュと同梱固定音声を使い、実プロセスのローカルWebSocketで認識、並行する状態確認、JSON・Opus保存、終了を確認した。再現用スクリプトはacceptance/check_websocket.py。モデルと音声は複製していない。設計・コメントを点検し、通信契約は維持した。
