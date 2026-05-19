# Frontend RTC Contract

## Summary

- フロントエンドと `sincro-rtc` の WebRTC signaling / media / DataChannel 契約を定義する。
- フロントは `config.json` で接続先と ICE 設定を取得し、`offer` と `candidate` を HTTP JSON で送る。
- WebRTC 確立後、音声は MediaTrack、テキストは `text_ch`、テロップ・口形同期は `telop_ch` で扱う。
- この契約を変更する場合は、frontend と backend を同時に更新する。

## Producers / Consumers

- Producer:
    - Frontend: Offer、ICE candidate、audio track
    - `sincro-rtc`: config、Answer、DataChannel payload、返却 audio track
- Consumer:
    - Frontend: config、Answer、DataChannel payload、返却 audio track
    - `sincro-rtc`: Offer、ICE candidate、audio track

## Compatibility Policy

- DataChannel 名、endpoint path、必須 JSON field の変更は破壊的変更として扱う。
- `text_ch` の `expression_code` は任意 field とし、欠落時は neutral 相当として扱う。
- 破壊的変更時は `src/features/rtc/rtcTalkClient.ts`、`RTCSignalingServer.py`、`RTCSessionOffer.py`、関連 task を同時更新する。

## Endpoints / Channels

| 種別        | 名前                                     | 用途                                           |
| ----------- | ---------------------------------------- | ---------------------------------------------- |
| HTTP GET    | `/api/v1/RTCSignalingServer/config.json` | offer / candidate URL と ICE 設定を返す        |
| HTTP POST   | `/api/v1/RTCSignalingServer/offer`       | Offer を受け取り Answer と `session_id` を返す |
| HTTP POST   | `/api/v1/RTCSignalingServer/candidate`   | Trickle ICE candidate を受け取る               |
| HTTP GET    | `/api/v1/RTCSignalingServer/statuses`    | セッション数などの簡易状態確認                 |
| HTTP GET    | `/api/v1/RTCSignalingServer/cleanup`     | 終了済みセッションの掃除                       |
| DataChannel | `text_ch`                                | チャットメッセージ                             |
| DataChannel | `telop_ch`                               | テロップ、mora、口形同期                       |
| MediaTrack  | audio                                    | ユーザー音声送信、合成音声返却                 |

## Payloads

### Config Response

```json
{
    "offerURL": "/api/v1/RTCSignalingServer/offer",
    "candidateURL": "/api/v1/RTCSignalingServer/candidate",
    "iceServers": []
}
```

### Offer Request

```json
{
    "sdp": "...",
    "type": "offer",
    "talk_mode": "chat",
    "session_id": "optional-existing-session-id"
}
```

`talk_mode` は `chat` または `sincro` を想定する。

### Offer Response

```json
{
    "sdp": "...",
    "type": "answer",
    "session_id": "..."
}
```

### Candidate Request

```json
{
    "session_id": "...",
    "candidate": {
        "candidate": "...",
        "sdpMid": "0",
        "sdpMLineIndex": 0
    }
}
```

end-of-candidates は `candidate: null` で送る。

### Candidate Response

```json
{
    "status": true
}
```

閉塞または不明セッションへの late candidate は `status: false` と `reason` を返す。

## Error Semantics

- セッション上限超過は HTTP 429 と `{"error":"Too many requests."}` を返す。
- 不正 DataChannel または想定外 track は session process 側で終了対象とする。
- candidate format 異常はログに残し、可能な範囲で接続継続を優先する。
- `expression_code` の未知値や欠落はフロント側で neutral として扱う。

## Timeout / Retry

- Trickle ICE 方式で Offer を先に送信し、candidate は逐次 `/candidate` へ送る。
- フロントは ICE restart 付き Offer により再接続する。
- 再接続は単一タイマーで管理し、指数 backoff と jitter を使う。

## Versioning

- 現時点では明示的な protocol version field は持たない。
- 互換性に影響する変更は frontend / backend 同時更新とし、`documents/design/index.md` の導線も更新する。

## Test Matrix

| 観点        | 確認内容                                                 |
| ----------- | -------------------------------------------------------- |
| config      | `config.json` が offer / candidate URL と ICE 設定を返す |
| offer       | Answer と `session_id` を受け取れる                      |
| candidate   | 通常 candidate と end-of-candidates を送れる             |
| DataChannel | `text_ch` / `telop_ch` が open し payload を受信する     |
| reconnect   | ICE failed 後に ICE restart 付き Offer を送れる          |

## References

- `documents/design/backend/services/sincro-rtc.md`
- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/networking_rtc.md`
