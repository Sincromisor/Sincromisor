# MediaPipeの共有分類器を直列実行して受信待ちを分離する

## 背景 / 目的

SpeechExtractorWorkerは共有AudioClassifier.classifyをWebSocket処理から同期呼出ししている。分類中に他の接続も待つため、分類器の共有条件を維持してイベントループから分離する。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [SpeechExtractorWorker.py](../../../sincromisor-server/speech-extractor/src/speech_extractor/SpeechExtractor/SpeechExtractorWorker.py)
- [SpeechExtractorProcess.py](../../../sincromisor-server/speech-extractor/SpeechExtractorProcess.py)

## 設計判断

- サービス所有の一つの実行スレッドで分類器の生成・分類・closeを行う。接続ごとの分類器複製や、同じ分類器への同時呼出しは導入しない。
- 分類結果を待ってから既存の発話状態を更新する。WebSocket、ExtractState、sequence_idの更新は接続側が所有する。
- 取消済みの未開始要求を分類器へ渡さず、実行中要求は終了を回収してから分類器を閉じる。接続を終了した後に発話結果を送らない。
- 3200サンプルの受信条件、500msの先行音声、無音時間、Speech判定閾値とmax_results=1を維持する。

## 完了条件と確認方法

- [x] 遅延する分類器を使い、分類待ち中もイベントループが進み、2接続でも分類が重ならないことを確認する。
- [x] 取消・分類失敗・サービス終了で所有とclose順序を確認し、同じ入力に対する発話区間とsequence_idが変わらない。
- [x] 採用MediaPipeを利用するLinux検証環境で実AudioClassifierの生成・分類・closeを新しい実行経路で一度確認する。検証環境はPython依存更新タスクを参照する。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

VADモデル変更、MediaPipeのAUDIO_STREAMへの移行、受信バッファの最適化、送信粒度・閾値の調整。

## 文書と契約

[speech-extractor.md](../../../documents/design/backend/services/speech-extractor.md)に変更後の所有者と処理の流れを反映する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 実装・確認結果

共有分類器の生成・分類・closeを単一ThreadPoolExecutorへ移し、接続側は結果を非同期に待つ。未開始要求の取消、実行中要求の取消後の送信抑止、分類失敗、closeの待合せ、500msの先行音声と発話区間・sequence_idを3試験で確認した。

`sincro-deps-python:verify`のロック済みPython環境でpytest、対象Ruff、tyを実行した。Ruffの既存ファイル名に対するN999は対象外として確認した。実MediaPipe 1.1.0はネイティブ依存を備えた既存抽出器イメージへ変更コードを読取り専用で接続し、YAMNetの生成・分類・closeが専用スレッドで成功した。通信形式・分類条件は維持し、設計とコメントを点検した。
