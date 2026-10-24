# 実装記録

## 確認した根拠

- [音声入力](../../../sincromisor-frontend/src/app/controller/sincroAudioInputController.ts)はカメラを無効にしてマイクを取得し、[RTC接続](../../../sincromisor-frontend/src/features/rtc/rtcPeerConnectionFactory.ts)が音声トラックだけを送信する。サンプル診断も送信トラックを作るため「入力を送らない」とは表示しない。
- [認識処理](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py)は認識結果と音声を[保存処理](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerS3Client.py)へ渡す。標準[認識イメージ](../../../Docker/speech-recognizer-nemo/Dockerfile)は音声変換用の `opus-tools`を含み、[保存構成](../../../compose/s3.yml)は永続ボリュームを割り当てる。保存例外と変換器不在は実装上の失敗・省略経路であり、非保存の保証ではない。
- [会話エージェント](../../../sincromisor-server/agent-server/src/mastra/agents/character.ts)はMemoryを持ち、[配備定義](../../../compose/agent-server.yml)の `/data`に保存する。`sincro`と診断はこの会話履歴保存を通らないため、会話履歴の説明は `chat`だけに表示する。
- [追跡実行時](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts)はブラウザー内で映像を処理する。[RTC契約](../../../documents/design/contracts/frontend-rtc.md)の送信トラックは音声だけであり、診断にも映像・推論結果を含めない。
- [VRM保存](../../../sincromisor-frontend/src/features/dialog/model/dialogVrmFileService.ts)はCache Storage、[設定保存](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsPersistence.ts)はlocalStorageを使う。

## 表示の判断

音声の送信・認識データ保存と映像の処理場所は選択欄から判断できないため、開始前に短く表示した。履歴・VRM・設定の保存先は任意の詳細へまとめた。権限の拒否が分かった機器だけ、利用者がブラウザーで許可を戻す必要を表示する。権限照会は権限を要求せず、非対応の場合は開始時の取得結果に委ねる。概要からカメラをオフにできる。

## 確認

対象Biome、型検査・ビルド、表示分岐のVitest1件、Playwright CLIで概要・詳細、320px幅、カメラ無効、ブラウザーの権限拒否、詳細の任意開閉と戻る操作を確認した。実RTC接続は未実施。
