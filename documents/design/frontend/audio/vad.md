# Frontend VAD

## Summary

- フロント側 VAD はマイク入力の RMS / Peak と学習 VAD を使い、送信ゲートや UI 表示に利用する。
- VAD は UI ではなく audio / media control の一部として扱う。
- 診断値は Debug Console の Audio / Status から確認できるようにする。

## Scope

- 対象:
    - フロント側 VAD mode
    - VAD parameter
    - Debug Console 観測項目
- 非対象:
    - server side SpeechExtractor
    - 音声認識 model

## Responsibilities

- `src/features/media/userMedia`
    - microphone / camera stream、device constraint、track lifecycle、audio profile を置く。
- `src/features/media/vad`
    - Silero VAD worker、learned VAD client、audio processing runtime、speech state を置く。
- `src/features/media/devices`
    - media device list service を置く。
- UserMedia / audio processing:
    - microphone stream から volume envelope を計算する。
- VAD state:
    - speaking / silence / uncertain などの状態を app controller へ渡す。
- UI:
    - VAD 状態を通常 UI と Debug Console へ表示する。

## Modes

- RMS / Peak:
    - 軽量で、即時反応が必要な表示に使う。
- 学習 VAD:
    - ノイズ耐性が必要な発話判定に使う。
- 厳格判定:
    - 誤検出を抑えたい場面で使う。

## Change Checklist

- VAD parameter を変更したら Debug Console の表示と設定 UI の文言を確認する。
- audio device 切替時に VAD 状態が古い stream を参照していないか確認する。
- server side SpeechExtractor の仕様変更とは別文書で扱う。

## References

- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/frontend_vad.md`
