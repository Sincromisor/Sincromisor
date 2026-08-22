# Backend Service: SpeechRecognizer

## Summary

- SpeechRecognizer は抽出済み音声区間を text へ変換する downstream service である。
- 現行の主対象は Nemo recognizer で、Nue-ASR は廃止済み/通常導線外として扱う。
- 固有名詞補強は initiative と辞書 contract に分離する。

## Scope

- 対象:
    - SpeechRecognizer service boundary
    - Nemo recognizer の認識結果
    - confirmed / partial の扱い
    - 固有名詞補強との接続点
- 非対象:
    - Audio extraction
    - TextProcessor の応答生成

## Responsibilities

- Go pipeline coordinator から speech segment を受け取る。
- speech segment を partial / confirmed result へ変換する。
- 必要に応じて confirmed result に後処理を適用する。
- 結果を TextProcessor へ渡せる msgpack model として返す。

## Proper Noun Biasing

- 辞書仕様:
    - `documents/design/contracts/proper-noun-dictionary.md`
- 導入計画:
    - `documents/design/initiatives/proper-noun-biasing.md`
- 基本方針:
    - partial の低遅延経路を保つ。
    - confirmed 時に読み一致補正、context biasing、N-best reranking を段階導入する。
    - raw ASR result と correction trace はデバッグ可能に残す。

## Change Checklist

- `SpeechRecognizerResult` を変える場合は WebSocket contract と TextProcessor を同時確認する。
- 辞書列を変える場合は proper noun dictionary contract を更新する。
- confirmed 専用の重い処理を入れる場合は latency と fallback を確認する。

## References

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/contracts/proper-noun-dictionary.md`
- `documents/design/initiatives/proper-noun-biasing.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_biasing.md`
