# Backend Service: TextProcessor

## Summary

- TextProcessor は認識 text から応答 text、chat message、telop 情報を生成する downstream service である。
- `talk_mode` により path と応答方針が変わる。
- text / telop の出力は frontend RTC contract にも影響する。

## Scope

- 対象:
    - TextProcessor service boundary
    - `chat` / `sincro` mode
    - ChatMessage / telop 生成との接続点
- 非対象:
    - LLM provider の詳細設定
    - 音声合成処理

## Responsibilities

- SpeechRecognizer result を受け取る。
- `talk_mode` に応じて応答 text を生成する。
- `ChatMessage` と telop / voice synthesizer input を組み立てる。
- 必要に応じて `expression_code` を抽出し、本文から制御記号を除去する。

## Interfaces

- Downstream contract:
    - `documents/design/contracts/audio-pipeline-websocket.md`
- Frontend-visible contract:
    - `documents/design/contracts/frontend-rtc.md`

## Change Checklist

- `ChatMessage` の field を変える場合は frontend RTC contract と `RTCMessage.ts` を確認する。
- `expression_code` の値域や意味を変える場合は Character motion と UI 表示を確認する。
- `talk_mode` を追加する場合は frontend settings、AudioBroker path、TextProcessor route を同時更新する。

## References

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/archive/legacy-flat/backend_text_processor.md`
