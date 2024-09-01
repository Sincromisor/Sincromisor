# ログについて

ここ(src/log)にログファイルが出力されます。

## Launcher.log

サーバーやワーカーのプロセスを立ち上げる、Launcherのログがここに出力されます。

## Sincromisor.log

アプリサーバーや、サーバー側のWebRTCプロセス、
WebRTCプロセスと各ワーカーとの間を取り持つAudioBrokerのログなどがここに出力されます。

## SpeechExtractorWorker.log

音声抽出ワーカーのログです。
MediaPipeのAudioClassifierのログがここに出力されます。

## SpeechRecognizerWorker.log

音声認識ワーカーのログです。
Nue-ASRのログがここに出力されます。

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
[SpeechRecognizerResult](../sincroLib/models/SpeechRecognizerResult.py)の中身がJSON形式で出力されます。
