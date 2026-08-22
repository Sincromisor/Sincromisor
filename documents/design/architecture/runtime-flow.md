# Runtime Flow

## Summary

- 起動時、フロントエンドは RTC 設定を取得し、WebRTC Offer を送信する。
- WebRTC 確立後、ユーザー音声は audio track でPion実装の `sincro-rtc` に入り、Go pipeline coordinator が下流サービスへ中継する。
- 応答テキストは `text_ch`、テロップ・口形同期情報は `telop_ch`、合成音声は返却 audio track でフロントへ戻る。

## Scope

- 対象:
    - 起動から会話成立までの代表フロー
    - 正常系と主要な失敗箇所
- 非対象:
    - payload の全フィールド定義
    - 各推論サービスの内部アルゴリズム

## Startup Flow

1. フロントエンドが `GET /api/v1/RTCSignalingServer/config.json` を取得する。
2. ユーザーが起動前 dialog でマイク、Gaze カメラ、VRM、会話モードを選ぶ。
3. `SincroController` / `SincroAppController` が UserMedia と WebRTC 接続を開始する。
4. `RTCTalkClient` が audio track と `text_ch` / `telop_ch` を持つ PeerConnection を作る。
5. フロントエンドが `/offer` へ SDP と `talk_mode` を送信する。
6. `sincro-rtc` がPion sessionを生成または更新し、Answer と `session_id` を返す。
7. ICE candidate は `/candidate` へ後送される。

## Conversation Flow

```mermaid
sequenceDiagram
    participant F as Frontend
    participant R as sincro-rtc
    participant B as Go pipeline coordinator
    participant E as SpeechExtractor
    participant A as SpeechRecognizer
    participant T as TextProcessor
    participant V as VoiceSynthesizer

    F->>R: WebRTC audio track
    R->>B: audio frame
    B->>E: msgpack audio
    E->>A: speech segment
    A->>T: recognized text
    T-->>R: ChatMessage via broker queue
    T->>V: response text
    V-->>R: synthesized voice frames
    R-->>F: text_ch / telop_ch
    R-->>F: WebRTC audio track
```

## Failure Points

- `config.json` 取得失敗:
    - フロントの接続先設定、reverse proxy、`sincro-rtc` 起動状態を確認する。
- `offer` 失敗:
    - セッション上限、ICE 設定、`RTCSessionOffer` の互換性を確認する。
- ICE failed:
    - フロントの再接続ログ、候補送信、公開 host / port を確認する。
- 下流サービス接続失敗:
    - pipeline coordinator の worker 解決、Consul、fallback host / port を確認する。
- `text_ch` / `telop_ch` 未受信:
    - DataChannel 名、open 状態、TextProcessor / Synthesizer の出力キューを確認する。

## References

- `documents/design/contracts/frontend-rtc.md`
- `documents/design/contracts/audio-pipeline-websocket.md`
