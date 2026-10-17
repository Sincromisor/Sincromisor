# 認識用の累積音声を容量付きバッファで保持する

## 背景 / 目的

SpeechRecognizerNemoProcessは発話チャンクごとにnp.appendを使い、発話先頭からの音声をコピーする。全音声を認識する既存動作を保ちつつ、配列の再確保を容量不足時に限定する。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [SpeechRecognizerNemoProcess.py](../../../sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py)
- [SpeechExtractorResult.py](../../../sincromisor-server/sincro-models/src/sincro_models/SpeechExtractorResult.py)

## 設計判断

- 接続がint16の作業配列、使用長、speech_idを所有する。容量が足りる間は末尾へコピーし、不足時だけ容量を増やす。実際の使用範囲をrecognizeへ渡す。
- 新speech_idで使用長をリセットする。初回チャンクを含め、認識に渡す配列は書込み可能な連続配列とし、受信bytesから作った読取り専用配列をそのまま渡さない。
- 同一接続の認識が終わるまでバッファを更新しない。別スレッドで認識する変更と組み合わせる場合も、この所有条件を維持する。
- 受信PCMの形式と暫定・確定結果の送信タイミングは維持する。新しい発話長制限やバッファ設定値は追加しない。

## 完了条件と確認方法

- [x] 複数チャンクとspeech_idの切替について、recognizeへ渡る音声が従来の累積値と一致する。初回・追加・拡張後の配列が書込み可能である。
- [x] 容量内の追記で作業配列を作り直さず、容量拡張時も音声の欠落・重複がないことを確認する。
- [x] 実際の受信処理を固定MessagePackと試験用recognizeへ接続し、配列の有効範囲と送信されるID・確定状態を確認する。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

音声区間抽出、認識の差分化、共有SpeechExtractorResultの形式変更、NeMoモデル・辞書の変更。

## 文書と契約

設計の外部契約は変更しない。確認結果と判断はこのタスクへ記録する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [累積配列のコピーを避ける対象](https://numpy.org/doc/stable/reference/generated/numpy.append.html)。

## 実装・確認結果

接続内でint16配列と使用長を所有し、容量不足時だけ必要量または従来容量の2倍へ拡張する。speech_id切替では使用長をリセットし、初回を含む受信チャンクを作業配列へコピーして有効範囲だけを認識へ渡す。認識完了後に次の受信へ進む順序は維持した。実プロセスの受信処理へ固定MessagePack5件と試験用認識処理を接続し、旧累積値との一致、書込み可能性・連続性、容量内での配列再利用、拡張・発話切替、送信IDと確定状態を確認した。ロック済み環境で対象試験、Ruff・整形・tyが成功し、コメント点検を完了した。
