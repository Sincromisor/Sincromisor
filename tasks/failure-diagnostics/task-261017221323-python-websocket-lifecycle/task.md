# Python音声サービスの接続終了を識別可能にする

## 背景 / 目的

SpeechExtractor、SpeechRecognizer、TextProcessor、VoiceSynthesizerのWebSocket入口は切断を固定文で記録し、コード・接続識別子・保持中の会話IDを失う。

優先度: 最優先。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [Pythonの実ライブラリ例外を診断原因へ分類する](../task-261017221323-python-failure-classification/task.md)

## 担当範囲

- [sincromisor-server/speech-extractor/SpeechExtractorProcess.py](../../../sincromisor-server/speech-extractor/SpeechExtractorProcess.py)
- [sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py](../../../sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py)
- [sincromisor-server/text-processor/TextProcessorProcess.py](../../../sincromisor-server/text-processor/TextProcessorProcess.py)
- [sincromisor-server/voice-synthesizer/VoiceSynthesizerProcess.py](../../../sincromisor-server/voice-synthesizer/VoiceSynthesizerProcess.py)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: モデル初期化の再設計、受信キューの変更、サービス間のconnection_id伝送、要求単位の合成ログ。

## 設計判断

- 4サービスの接続開始・終了ログだけを揃える。接続ごとにローカルなconnection_idを付け、受信済みのsession_id等はワーカーから最小の状態受渡しで記録する。session_id取得前は省略し、通信形式を変更しない。
- WebSocketDisconnectのcodeと既知理由、処理段階、通常終了・取消・異常を記録する。相手理由の自由文は出さない。サーバー側で取得できない送信済みclose codeを推測しない。
- 最初の失敗とcleanupを区別し、既に閉じた接続へのcloseで主原因を隠したり正常終了をwarningにしない。処理順序・資源解放は維持する。

## 完了条件

- [ ] 全4サービスで同時接続と初回要求前の切断をconnection_idで区別できる。要求受信後の異常には実際に保持する会話IDを付ける。
- [ ] 正常切断と異常コード、受信・処理・送信の失敗が区別され、cleanupの二次例外で原因ログを失わない。

## 確認方法

- 高価なモデルを代役にしたWebSocket入口の小さな試験で、正常終了・1011・要求前切断・送信失敗を確認する。各サービスの対象pytestと変更PythonのRuffを実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)
- [documents/design/contracts/audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。
