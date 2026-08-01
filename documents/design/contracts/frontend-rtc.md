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

## DataChannel negotiation

- Frontendが `RTCPeerConnection.createDataChannel()` を呼び出すinitiatorであり、backendはin-band negotiationで作成されたchannelを受理する。
- `protocol` は空文字列とする。
- payloadはUTF-8 JSONのtext messageとする。binary messageは契約対象外とする。
- `text_ch` は `ordered: true` かつ再送回数・生存時間を制限しないreliable channelとする。
- `telop_ch` は `ordered: false, maxRetransmits: 0` のunordered / unreliable channelとする。欠落と順序逆転は正常系として扱い、受信順序を保証しない。
- ICE restart付きupdate Offerは既存の `RTCPeerConnection` に適用し、既存DataChannelを再利用する。新しいchannelは作成しない。

現行frontendはpayloadのschema validationを行うが、`telop_ch` の重複排除やstale判定は行わない。message sizeのapplication上限も未定義である。これらを追加する場合はfrontend / backend間の契約変更として同時に実装する。

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
    "offer_request_id": "8e0e18a9-243b-4c72-8e97-a1b103854e42",
    "offer_revision": 1,
    "previous_session_id": "01K1AF2Y0H0000000000000000"
}
```

initial Offerでは`session_id`を送らず、`talk_mode`は`chat`または`sincro`、
`offer_request_id`はFrontend発行UUID、`offer_revision`は`1`を必須とする。
`previous_session_id`は任意のULIDで、旧sessionとの相関ログだけに使う。
同じrequest IDをretryするときは同じSDP bytesを送り、SDPを再生成した場合は新しいUUIDを発行する。
`session_id`付きupdate Offerは現段階ではHTTP 501を返す。

### Offer Response

```json
{
    "sdp": "...",
    "type": "answer",
    "session_id": "01K1AF2Y0H0000000000000001",
    "offer_revision": 1
}
```

同じrequest IDと同じSDP bytesの直列・並行retryは、candidate収集済みの同じAnswerとsession IDを返す。
request IDは受信したSDP bytesのSHA-256へ結び付け、異なるSDPへの再利用を受理しない。
completed Answerと終了sessionのtombstoneは2分保持し、両者とin-flightを合計1000件まで保持する。
期限内entryをcapacity都合でevictしない。active sessionは作成予約を含めprocess当たり100件までとする。

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

- JSON syntax/type、UUID/ULID format、SDP不正はHTTP 400を返す。
- 同じrequest IDを異なるSDPへ再利用した場合はHTTP 409を返す。
- 終了sessionの有効なinitial Offer tombstoneはHTTP 410を返す。
- HTTP bodyの1 MiB超過またはSDPの256 KiB超過はHTTP 413を返す。
- session上限またはinitial Offer registry上限超過はHTTP 429と`{"error":"Too many requests."}`を返す。
- candidate収集が起動時設定の期限を超えた場合はHTTP 504を返し、失敗結果をcacheしない。
- 不正 DataChannel または想定外 track は session process 側で終了対象とする。
- candidate format 異常はログに残し、可能な範囲で接続継続を優先する。
- `expression_code` の未知値や欠落はフロント側で neutral として扱う。

## Timeout / Retry

- FrontendからPionへはTrickle ICEを使う。PionからのcandidateはAnswer SDPへ収集して返すhalf-trickleとする。
- initial OfferのHTTP responseを失った場合は、同じrequest IDと同じSDPで再送する。
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
| DataChannel | 両channelがopenし、各channelの信頼性属性どおり受信する   |
| reconnect   | ICE failed 後に ICE restart 付き Offer を送れる          |

## References

- `documents/design/backend/services/sincro-rtc.md`
- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/networking_rtc.md`
