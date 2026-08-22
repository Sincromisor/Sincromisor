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
| HTTP GET    | `/api/v1/RTCSignalingServer/statuses`    | セッション数とprocess受入状態の簡易確認        |
| DataChannel | `text_ch`                                | チャットメッセージ                             |
| DataChannel | `telop_ch`                               | テロップ、mora、口形同期                       |
| MediaTrack  | audio                                    | ユーザー音声送信、合成音声返却                 |

通常のPion `sincro-rtc` の`statuses`は`{sessions, session_limit, ready, draining}`を返し、GET以外を
405とする。session close時にregistryから自動除去するため、状態変更を行う`cleanup` GETは通常契約に含めない。

## DataChannel negotiation

- Frontendが `RTCPeerConnection.createDataChannel()` を呼び出すinitiatorであり、backendはin-band negotiationで作成されたchannelを受理する。
- `protocol` は空文字列とする。
- payloadはUTF-8 JSONのtext messageとする。binary messageは契約対象外とする。
- `text_ch` は `ordered: true` かつ再送回数・生存時間を制限しないreliable channelとする。
- `telop_ch` は `ordered: false, maxRetransmits: 0` のunordered / unreliable channelとする。欠落と順序逆転は正常系として扱い、受信順序を保証しない。
- ICE restart付きupdate Offerは既存の `RTCPeerConnection` に適用し、既存DataChannelを再利用する。新しいchannelは作成しない。

各payloadはUTF-8 JSON textかつ64 KiB以下とする。`text_ch`は64件FIFOで、満杯時はincomingを拒否して
sessionを終了する。`telop_ch`は128件FIFOで、満杯時は最古の未送信eventをdropしてsessionを継続する。
Frontendは`telop_ch`の欠落、順序逆転を正常系として扱う。

backendはDataChannelの`bufferedAmount`が1 MiB以上なら送信を抑制し、256 KiB以下への復帰を最大5秒待つ。
timeout、reliableな`text_ch`の送信失敗、channel closeはsession errorとする。unreliableな`telop_ch`の
単発送信失敗は該当eventだけをdropする。

## Payloads

### Outbound audio / telop synchronization

返却audioは48 kHz mono PCMを20 ms / 960 sample単位でOpus encodeした連続trackである。
backendのsession所有clockはbrowser音声入力の有無に依存せず動作し、合成発話がない期間もsilence frameを送る。
scheduler遅延で期限切れになったsilenceはburst送信せずdropする。activeな合成発話の遅延が250 msを超えた場合は、
その発話の残audioと未送信telopを中止し、次発話を20 ms間隔で再開する。
dropした20 ms slotは次のRTP packetのtimestampとsequence numberのgapへ反映し、その後の送信packetは
再び960 timestamp tick / 1 sequence numberずつ進む。

`telop_ch` payloadは次のschemaを使う。

```json
{
    "speech_id": 1,
    "timestamp": 0.02,
    "message": "こんにちは",
    "vowel": "o",
    "text": "ん",
    "length": 0.08,
    "new_text": true
}
```

- 各20 ms audio frameの開始sampleを含むactive moraがある場合だけ、そのframeのtrack書き込み直前に1件生成する。
- `timestamp`は発話開始からのframe開始sampleを48000で割った秒、`length`はmoraのsample幅を48000で割った秒とする。
- `message`はdecode前の同じ合成結果に含まれる元messageを保持する。
- producer上の`vowel` / `text`がnilの場合はempty stringへ変換し、非nilのempty stringもemptyのまま送る。
- `new_text`は同じmoraを送る最初のframeだけ`true`、後続frameは`false`とする。
- mora境界がframe内にある場合は次frameの開始から新しいmoraへ切り替える。active moraがないframeはaudioだけを送る。
- pipeline generation変更時は、旧generationの未送信audio、`text_ch`、`telop_ch` eventを一括破棄する。

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
ただしPionは互換性のため、`session_id`、`offer_request_id`、`offer_revision`をすべて省略した
legacy initial Offerだけを受理し、server側でUUIDとrevision `1`を生成する。legacy形式はrequest IDを
持たないため、HTTP retryで同じAnswerを返す保証はない。identityの一部だけの省略、空値、形式不正はHTTP 400とする。
`previous_session_id`は任意のULIDで、旧sessionとの相関ログだけに使う。
`session_id`の省略と`null`/空文字は同一視せず、initial Offerに後者があればHTTP 400とする。
`previous_session_id`も省略またはstrict ULID文字列だけを許可し、`null`や文字列以外はHTTP 400とする。
同じrequest IDをretryするときは同じSDP bytesを送り、SDPを再生成した場合は新しいUUIDを発行する。

update Offerではinitialと同じ`offer_request_id`、既存のstrict ULID `session_id`、
現在値より1大きい`offer_revision`、session作成時と同じ`talk_mode`を必須とする。
`previous_session_id`はupdateでは送らない。

```json
{
    "sdp": "...",
    "type": "offer",
    "talk_mode": "chat",
    "session_id": "01K1AF2Y0H0000000000000001",
    "offer_request_id": "8e0e18a9-243b-4c72-8e97-a1b103854e42",
    "offer_revision": 2
}
```

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

update Offerはsession単位でsingle-flightとし、Offer適用、Answer生成、candidate追加を直列化する。
同じrevisionと同じSDPの完了後retryには保存済みAnswerを返す。同じrevisionの異なるSDP、
旧revision、1を超えてskipした未来revision、initialと異なるrequest ID、並行updateはHTTP 409とする。
成功時は既存`session_id`、`RTCPeerConnection`、DataChannel、pipelineと同じrevisionのAnswerを返す。
保存済み`talk_mode`と異なる有効値もHTTP 409とし、pipelineのmodeは変更しない。

remote description適用前のupdate失敗はcurrent revisionを維持して再試行可能とする。
適用後にAnswer生成またはcandidate収集が失敗した場合はPion rollbackへ依存せずsessionを終了し、
未完成Answerをcacheしない。

### Candidate Request

```json
{
    "session_id": "...",
    "offer_revision": 2,
    "candidate": {
        "candidate": "...",
        "sdpMid": "0",
        "sdpMLineIndex": 0,
        "usernameFragment": "..."
    }
}
```

`session_id`と`offer_revision`は必須で、current accepted revisionだけを受理する。
end-of-candidates は明示的な`candidate: null`で送る。`candidate` fieldの省略はHTTP 400であり、
`null`とは同一視しない。

candidateの冪等keyはcandidate文字列の受信bytes、`sdpMid`、`sdpMLineIndex`、
`usernameFragment`のtupleである。optional fieldの省略と`null`は同一視するが、
文字列のtrimやcase変換は行わない。end-of-candidatesも1件としてdedupeする。
1 revision当たり異なるcandidateは64件までとし、重複candidateは上限へ加算せずPionへ再適用しない。

### Candidate Response

```json
{
    "status": true
}
```

受理または重複済みcandidateには`status: true`を返す。不明session、終了session、revision競合は
それぞれHTTP 404、410、409とし、別sessionへfallbackしない。

## Error Semantics

- JSON syntax/type、field presence、UUID/ULID/revision format、SDP/candidate不正はHTTP 400を返す。
- 不明sessionはHTTP 404、終了sessionと有効なinitial Offer tombstoneはHTTP 410を返す。
- request ID/SDP/revision/`talk_mode`の競合と並行updateはHTTP 409を返す。
- HTTP bodyの1 MiB超過、SDPの256 KiB超過、candidate文字列の8 KiB超過はHTTP 413を返す。
- session上限、initial Offer registry上限、1 revisionのcandidate 64件超過はHTTP 429を返す。
- candidate収集が起動時設定の期限を超えた場合はHTTP 504を返し、失敗結果をcacheしない。
- 不正 DataChannel または想定外 track は session process 側で終了対象とする。
- candidate format 異常はログに残し、可能な範囲で接続継続を優先する。
- `expression_code` の未知値や欠落はフロント側で neutral として扱う。

Frontendは400、409、413、response parse/identity不一致、retry exhaustionを当該PeerConnection
generationのterminal failureとして扱う。candidate queueを破棄してPeerConnectionをcloseし、
AppControllerの明示的な再startまたはpage reloadまで新sessionを自動作成しない。candidate送信失敗も
単体dropせず、同じgenerationを失敗させる。

update Offerまたはcandidateの404/410だけはserver session消失として扱う。既知の旧`session_id`を
`previous_session_id`に設定し、新しいPeerConnection、DataChannel、request IDによるinitial Offerへ
置き換える。送信用audio trackは停止せず新PeerConnectionへ引き継ぐ。initial Offerの410は
responseから旧sessionを復元できないためterminal failureとする。
409はrevision/request identity競合でありblind retryしない。

## Timeout / Retry

- FrontendからPionへはTrickle ICEを使う。PionからのcandidateはAnswer SDPへ収集して返すhalf-trickleとする。
- identity付きinitial OfferのHTTP responseを失った場合は、同じrequest IDと同じSDPで再送する。legacy initial Offerは同一Answer retryを保証しない。
- update OfferのHTTP responseを失った場合は、同じsession ID、request ID、revision、SDPで再送する。
- Frontendはupdate Answerを受け取るまで同revisionのcandidateをqueueし、成功後に順序を保って送る。
- candidate queueはPeerConnection generationごとに最大64件のFIFOとする。overflow、Offer失敗、
  candidate送信失敗ではqueueを全破棄し、generationをterminal failureまたはsession消失時の
  bundle replacementへ遷移させる。
- `disconnected`から10秒以内に自然復旧した場合はsessionを維持し、updateを要求しない。
- `failed`は即時、`disconnected`の10秒grace超過は1回だけICE restartを開始する。Offer生成・送信・
  candidate flushはPeerConnection単位のsingle-flightとし、連続eventで並行Offerを作らない。
- ICE restart成功後は同じPeerConnection、DataChannel、pipeline generationでaudioを再開する。
- Offer HTTPは1実行10秒、candidate HTTPは1実行5秒のAbort timeoutを持つ。HTTP実行は最大4回
  （初回1回とretry 3回）、全体deadlineは30秒とする。429、5xx、network errorだけをretryし、
  失敗した実行1/2/3の後は500ms、1秒、2秒をcapとするfull jitter `[0, cap]` で待つ。
  `Retry-After`があればjitterより優先する。
- 各HTTP実行のtimeoutはoperation固有timeoutと全体deadline残時間の小さい方へclipする。
  残時間が0以下、またはsleep時間が残時間以上なら次のHTTP実行を開始しない。同じHTTP retryでは
  serialized body、SDP、request ID、revisionを変更しない。
- revisionなしinitial Answerは配信済みFrontendとの互換のため受理する。legacy modeの切断では
  update Offerを送らず、新しいPeerConnection/DataChannelでrevisionなしinitial接続を作り直す。

## Versioning

- 現時点では明示的な protocol version field は持たない。
- 互換性に影響する変更は frontend / backend 同時更新とし、`documents/design/index.md` の導線も更新する。

## Test Matrix

| 観点        | 確認内容                                                  |
| ----------- | --------------------------------------------------------- |
| config      | `config.json` が offer / candidate URL と ICE 設定を返す  |
| offer       | initial/update Answer、revision retry/競合を処理できる    |
| candidate   | revision付きcandidate、null、dedupe、64件上限を処理できる |
| DataChannel | 両channelがopenし、各channelの信頼性属性どおり受信する    |
| reconnect   | grace/deadline内の同一PeerConnection restartを確認する    |

## References

- `documents/design/backend/services/sincro-rtc.md`
- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/networking_rtc.md`
