# Backend Service: VoiceSynthesizer

## Summary

- VoiceSynthesizer は TextProcessor の応答 text を音声 frame へ変換する downstream service である。
- 出力音声は AudioBroker と `VoiceTransformTrack` を通じて WebRTC audio track でフロントへ返る。
- WebSocket / msgpack 契約は `contracts/audio-pipeline-websocket.md` を正本とする。

## Scope

- 対象:
    - VoiceSynthesizer service boundary
    - response text から voice frame への変換
    - AudioBroker への結果返却
- 非対象:
    - フロント側再生 UI
    - TextProcessor の応答生成

## Responsibilities

- TextProcessor output を受け取る。
- 音声合成 backend を呼び出す。
- `VoiceSynthesizerResultFrame` として AudioBroker へ返す。

## Change Checklist

- 音声 frame model を変える場合は AudioBroker と WebSocket contract を同時更新する。
- voice synthesis provider や設定を変える場合は compose env と secret handling を確認する。
- telop / mouth sync との関係を変える場合は frontend character motion と RTC contract を確認する。

## References

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/backend/services/text-processor.md`
- `documents/design/archive/legacy-flat/backend_voice_synthesizer.md`
