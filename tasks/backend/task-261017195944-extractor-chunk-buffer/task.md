# 音声区間抽出の受信バッファで繰り返す配列コピーを減らす

## 背景 / 目的

SpeechExtractorWorker.__get_audio_bufferは受信のたびにnp.appendを実行し、判定単位に達するまで蓄積済みの音声を毎回コピーする。受信チャンクを保持し、判定時に一度だけ連続配列へまとめる。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [SpeechExtractorWorker.py](../../../sincromisor-server/speech-extractor/src/speech_extractor/SpeechExtractor/SpeechExtractorWorker.py)
- [SpeechExtractorResult.py](../../../sincromisor-server/sincro-models/src/sincro_models/SpeechExtractorResult.py)

## 設計判断

- 受信チャンク列と総サンプル数を持ち、現在の出力条件を満たした時に結合する。最小値をちょうど満たした場合の扱いも現在のbuffer.size > target_lengthを保つ。
- 入力のdtype、フレーム順序、余りの扱い、先行音声と無音終端を変えない。既存SpeechExtractorResult.append_voiceの呼出元を確認するが、今回の変更は受信蓄積に限定する。
- 分類器の呼出しと発話状態遷移はそのまま利用する。判定結果を固定した試験で受信処理を確認できるようにする。

## 完了条件と確認方法

- [x] 閾値未満・ちょうど・超過、複数サイズのチャンクについて、変更前後の出力配列と出力時点が一致する。
- [x] 結合が判定単位ごとに一度となり、受信ごとの全体コピーがなくなることを小さな試験で確認する。切断時に未完成音声を新たに送らない。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

VAD判定条件、送信粒度、SpeechExtractorResultの共有モデル表現、分類器の非同期化、認識側のバッファ。

## 文書と契約

設計の外部契約は変更しない。確認結果と判断はこのタスクへ記録する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [appendが新規配列へコピーする性質](https://numpy.org/doc/stable/reference/generated/numpy.append.html)。

## 実装・確認結果

受信チャンク列と総サンプル数を保持し、3200サンプルを超えた時だけ一度結合する方式へ変更した。append_voiceの呼出元を確認し、共有結果モデルと発話状態の処理は維持した。空・閾値未満・ちょうど・超過・異なるサイズのチャンクと切断について、旧append方式と出力配列・出力時点が一致し、結合回数が出力回数と一致することを確認した。ロック済み環境で抽出器の6試験、対象Ruff・整形・tyが成功した。コメント点検を完了し、外部契約の変更はない。
