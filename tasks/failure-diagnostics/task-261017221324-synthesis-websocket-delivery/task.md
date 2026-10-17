# 合成完了とRTCへの音声送信結果を区別する

## 背景 / 目的

合成成功はVoiceCacheManagerで記録され、その後のWebSocket送信失敗は要求に対応付かない。切断後に合成成功が出ても音声がRTCへ送られたとは限らない。

優先度: 高。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [Python音声サービスの接続終了を識別可能にする](../task-261017221323-python-websocket-lifecycle/task.md)
- [本文設定に依存しない音声合成の段階と時間を記録する](../task-261017221324-synthesis-operation-timing/task.md)

## 担当範囲

- [sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizerWorker.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizerWorker.py)
- [sincromisor-server/voice-synthesizer/tests/test_blocking_work.py](../../../sincromisor-server/voice-synthesizer/tests/test_blocking_work.py)
- [sincromisor-server/voice-synthesizer/tests/test_synthesis_logging.py](../../../sincromisor-server/voice-synthesizer/tests/test_synthesis_logging.py)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: WebSocket再送、受信停止問題の修正、再生完了通知、音声契約の変更。

## 設計判断

- 要求受信、合成完了、send_bytes成功・失敗・取消を同じ接続ID、会話ID、系列ID、発話IDと接続内要求連番で対応付ける。
- 連番はPython接続内の照合に限る。他プロセスの連番と同一であると推測せず、通信モデルへ新しいIDを加えない。
- 取消後に同期合成スレッドを回収する既存動作を維持し、回収完了を送信成功として記録しない。

## 完了条件

- [x] 生成後の送信失敗が合成成功と別の終端結果として残り、どの要求が未送信か分かる。
- [x] 本文設定が無効でも要求と配送を追える。送信成功をブラウザーでの再生成功とは表示しない。

## 確認方法

- 既存の同期処理回収試験に、send_bytes失敗と生成中取消を加える。要求ごとの結果、ID、本文非出力、回収の完了を対象pytestで確認する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。

## 実施結果

要求受信、生成完了、配送終端を接続内連番と既存IDで照合できるようにした。生成中取消は同期スレッドの回収後に取消結果を記録し、生成結果を送らない。送信段階の失敗・取消も生成成功と分け、同じ発話内の複数音声を連番で区別する。

合成回収・本文設定・要求対応の対象pytestは25件成功した。連番確認を追加した1件の再確認も成功した。Ruff、整形、tyが成功し、コメント点検: PASS。既存の実HTTP合成2件はホストにopusencがないため今回の試験から除外した。実音声再生は対象外であり、配送成功とは区別している。
