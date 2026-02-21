# 設計ドキュメント

## Template

- [設計ドキュメントテンプレート](template.md)

## Frontend

- [UI](frontend_ui.md)
  - 基本となるユーザーインタフェース、デバッグコンソールなど
- [VAD](frontend_vad.md)
  - フロント側VAD（RMS/Peak・学習VAD・送信ゲート）の設計
- [VRM Character](frontend_character.md)
  - Three.js + VRM-1.0によるキャラクターレンダリングやアニメーションなどに関するもの全般

## Backend

- [RTC Server](backend_sincro_rtc.md)
- [Audio Broker](backend_audio_broker.md)
- [Speech Extractor](backend_speech_extractor.md)
- [Speech Recognizer (nemo / nue)](backend_speech_recognizer.md)
- [Text Processor](backend_text_processor.md)
- [Voice Synthesizer](backend_voice_synthesizer.md)
- [Storage](backend_storage.md)
  - Redis, SeaweedFS

## Networking

- [Frontend - RTC Server (WebRTC)](networking_rtc.md)
- [Audio Broker - SpeechExtractor, SpeechRecognizer, TextProcessor, VoiceSynthesizer (WebSocket)](networking_websocket.md)

## Hosting and Service Discovery

- [Docker Compose](service_compose.md)
- [Consul](service_consul.md)

## Obsoleted

下記については廃止予定であるため、ドキュメントには記載しない。

- Nue-ASR
  - sincromisor-server/speech-recognizer 以下一式
  - 公式リポジトリ消滅のため
- Babylon.js
  - sincromisor-frontend以下のキャラクター描画関連のうち、VRM1.0関連でないもの
  - Three.js + VRM1.0に移行済み。近日中に削除予定
  - VRM 1.0サポートが現状厳しいため
    - https://forum.babylonjs.com/t/loading-vrm-humanoid-based-model/4980/28
- MinIO
  - SeaweedFSに移行
  - 公式OSS版が終了見込のため

## ToDo

- Speech Extractor
  - 現状はMediapipeのAudio Classification(Yamnet)
  - RNNoiseにできないか検討中
    - https://github.com/Sincromisor/RNNoisePy
    - https://pypi.org/project/rnnoisepy/
- VRM Character
  - 現状は基本的な顔の動きのみ
  - 感情表現や上半身の動作などを追加したい
