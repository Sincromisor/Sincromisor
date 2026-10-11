# ログについて

ここ(src/log)にログファイルが出力されます。

## Launcher.log

サーバーやワーカーのプロセスを立ち上げる、Launcherのログがここに出力されます。

## Sincromisor.log

アプリサーバーや、サーバー側のWebRTCプロセス、
WebRTCプロセスと各ワーカーを接続するGo pipeline coordinatorのログなどがここに出力されます。

## SpeechExtractorWorker.log

音声抽出ワーカーのログです。
MediaPipeのAudioClassifierのログがここに出力されます。

## 音声認識のログ

NeMoの運用ログは標準出力へ出力されます。記録内容は[音声認識サービスの運用ログ](../../documents/design/backend/services/speech-recognizer.md#運用ログ)を参照してください。

## VoiceSynthesizerWorker.log

音声合成ワーカーのログです。
VOICEVOXやRedis、テキスト分割のログがここに出力されます。

## voice/$SessionID/$SpeechID\_$DATE\_$TIME.{wav,opus}

音声認識に用いた音声です。
WebRTC経由で得られた音声のうち、人の声があると思われる部分を抽出したものです。
opusencコマンドが利用できる環境では、opusファイルが出力されます。

SessionIDはULIDとなっており、時系列順でソートできます。
また、SpeechIDは、セッション中の発話順に割り当てられます。

## voice/$SessionID/$SpeechID\_$DATE\_$TIME.json

音声認識結果です。
[SpeechRecognizerResult](../sincro-models/src/sincro_models/SpeechRecognizerResult.py)の中身がJSON形式で出力されます。
