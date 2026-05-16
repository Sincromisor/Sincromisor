# Backend Service: SpeechExtractor

## Summary

- SpeechExtractor は audio frame から音声区間を抽出する downstream service である。
- AudioBroker から WebSocket + msgpack で audio を受け取り、発話区間結果を返す。
- 通信契約は `contracts/audio-pipeline-websocket.md` を正本とする。

## Scope

- 対象:
    - SpeechExtractor service
    - 音声区間抽出の service boundary
    - AudioBroker との接続
- 非対象:
    - RTC signaling
    - SpeechRecognizer 以降

## Responsibilities

- audio frame を受信する。
- `max_silence_ms` などのパラメータに従って音声区間を切る。
- `SpeechExtractorResult` を返す。

## Config / Deployment

- compose と env は `infrastructure/compose.md` を確認する。
- 現状は MediaPipe Audio Classification / Yamnet 系を基準とし、RNNoise は検討対象として扱う。

## Change Checklist

- result model を変える場合は `contracts/audio-pipeline-websocket.md` と Recognizer 側を同時更新する。
- VAD / silence parameter を変える場合は AudioBroker の path parameter と compose env を確認する。
- フロント側 VAD とは役割が異なるため、`frontend/audio/vad.md` と混同しない。

## References

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/archive/legacy-flat/backend_speech_extractor.md`
