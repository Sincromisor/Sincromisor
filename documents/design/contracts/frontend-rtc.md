# フロントエンドのRTC契約

## 要約

- フロントエンドと `sincro-rtc` の WebRTC シグナリング / メディア / DataChannel 契約を定義する。
- フロントは `config.json` で接続先と ICE 設定を取得し、`offer` と `candidate` を HTTP JSON で送る。
- WebRTC 確立後、音声は MediaTrack、テキストは `text_ch`、テロップ・口形同期は `telop_ch` で扱う。
- この契約を変更する場合は、フロントエンドとバックエンドを同時に更新する。

## 生成側・利用側

- 生成側:
    - フロントエンド: Offer、ICE 候補、音声トラック
    - `sincro-rtc`: 設定、Answer、DataChannel 送受信データ、返却音声トラック
- 利用側:
    - フロントエンド: 設定、Answer、DataChannel 送受信データ、返却音声トラック
    - `sincro-rtc`: Offer、ICE 候補、音声トラック

## 互換性方針

- DataChannel 名、エンドポイントパス、必須 JSON フィールドの変更は破壊的変更として扱う。
- `text_ch` の `expression_code` は任意フィールドとし、欠落時は中立相当として扱う。
- 破壊的変更時は `src/features/rtc/rtcTalkClient.ts`、`RTCSignalingServer.py`、`RTCSessionOffer.py`、関連タスクを同時更新する。

## エンドポイント・チャネル

| 種別        | 名前                                     | 用途                                           |
| ----------- | ---------------------------------------- | ---------------------------------------------- |
| HTTP GET    | `/api/v1/RTCSignalingServer/config.json` | offer / 候補 URL と ICE 設定を返す             |
| HTTP POST   | `/api/v1/RTCSignalingServer/offer`       | Offer を受け取り Answer と `session_id` を返す |
| HTTP POST   | `/api/v1/RTCSignalingServer/candidate`   | Trickle ICE 候補を受け取る                     |
| HTTP GET    | `/api/v1/RTCSignalingServer/statuses`    | セッション数とプロセス受入状態の簡易確認       |
| DataChannel | `text_ch`                                | チャットメッセージ                             |
| DataChannel | `telop_ch`                               | テロップ、モーラ、口形同期                     |
| MediaTrack  | 音声                                     | ユーザー音声送信、合成音声返却                 |

通常のPion `sincro-rtc` の`statuses`は`{sessions, session_limit, ready, draining}`を返し、GET以外を
405とする。セッション終了時に登録簿から自動除去するため、状態変更を行う`cleanup` GETは通常契約に含めない。

## DataChannelの接続交渉

- フロントエンドが `RTCPeerConnection.createDataChannel()` を呼び出す開始側であり、バックエンドは同一通信路内の接続交渉で作成されたチャネルを受理する。
- `protocol` は空文字列とする。
- 送受信データはUTF-8 JSONのテキストメッセージとする。バイナリメッセージは契約対象外とする。
- `text_ch` は `ordered: true` かつ再送回数・生存時間を制限しない信頼性を保証するチャネルとする。
- `telop_ch` は `ordered: false, maxRetransmits: 0` の順序を保証しない / 信頼性を保証しないチャネルとする。欠落と順序逆転は正常系として扱い、受信順序を保証しない。
- ICE 再接続付き更新Offerは既存の `RTCPeerConnection` に適用し、既存DataChannelを再利用する。新しいチャネルは作成しない。

各送受信データはUTF-8 JSON テキストかつ64 KiB以下とする。`text_ch`は64件FIFOで、満杯時は新規入力を拒否して
セッションを終了する。`telop_ch`は128件FIFOで、満杯時は最古の未送信イベントを破棄してセッションを継続する。
フロントエンドは`telop_ch`の欠落、順序逆転を正常系として扱う。

バックエンドはDataChannelの`bufferedAmount`が1 MiB以上なら送信を抑制し、256 KiB以下への復帰を最大5秒待つ。
時間切れ、信頼性を保証するな`text_ch`の送信失敗、チャネル終了はセッションエラーとする。信頼性を保証しないな`telop_ch`の
単発送信失敗は該当イベントだけを破棄する。

## 送受信データ

### 返却音声とテロップの同期

返却音声は48 kHz モノラル PCMを20 ms / 960 サンプル単位でOpus 符号化した連続トラックである。
バックエンドのセッション所有時計はブラウザ音声入力の有無に依存せず動作し、合成発話がない期間も無音フレームを送る。
スケジューラ遅延で期限切れになった無音は一括送信せず破棄する。有効な合成発話の遅延が250 msを超えた場合は、
その発話の残音声と未送信テロップを中止し、次発話を20 ms間隔で再開する。
破棄した20 ms 格納先は次のRTP パケットの時刻とシーケンス番号の欠落へ反映し、その後の送信パケットは
再び960 時刻刻み / 1 シーケンス番号ずつ進む。

`telop_ch` 送受信データは次のスキーマを使う。

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

- 各20 ms 音声フレームの開始サンプルを含む有効モーラがある場合だけ、そのフレームのトラック書き込み直前に1件生成する。
- `timestamp`は発話開始からのフレーム開始サンプルを48000で割った秒、`length`はモーラのサンプル幅を48000で割った秒とする。
- `message`は復号前の同じ合成結果に含まれる元メッセージを保持する。
- 生成側上の`vowel` / `text`が`nil`の場合は空文字列へ変換し、非`nil`の空文字列も空のまま送る。
- `new_text`は同じモーラを送る最初のフレームだけ`true`、後続フレームは`false`とする。
- モーラ境界がフレーム内にある場合は次フレームの開始から新しいモーラへ切り替える。有効モーラがないフレームは音声だけを送る。
- 処理工程世代変更時は、旧世代の未送信音声、`text_ch`、`telop_ch` イベントを一括破棄する。

### 接続設定の応答

```json
{
    "offerURL": "/api/v1/RTCSignalingServer/offer",
    "candidateURL": "/api/v1/RTCSignalingServer/candidate",
    "iceServers": []
}
```

### Offer要求

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

初回Offerでは`session_id`を送らず、`talk_mode`は`chat`または`sincro`、
`offer_request_id`はフロントエンド発行UUID、`offer_revision`は`1`を必須とする。
ただしPionは互換性のため、`session_id`、`offer_request_id`、`offer_revision`をすべて省略した
旧形式の初回 Offerだけを受理し、サーバー側でUUIDと改訂番号 `1`を生成する。旧形式形式は要求IDを
持たないため、HTTP 再試行で同じAnswerを返す保証はない。識別情報の一部だけの省略、空値、形式不正はHTTP 400とする。
`previous_session_id`は任意のULIDで、旧セッションとの相関ログだけに使う。
`session_id`の省略と`null`/空文字は同一視せず、初回Offerに後者があればHTTP 400とする。
`previous_session_id`も省略または厳格な形式のULID文字列だけを許可し、`null`や文字列以外はHTTP 400とする。
同じ要求IDを再試行するときは同じSDP バイト列を送り、SDPを再生成した場合は新しいUUIDを発行する。

更新Offerでは初回と同じ`offer_request_id`、既存の厳格な形式のULID `session_id`、
現在値より1大きい`offer_revision`、セッション作成時と同じ`talk_mode`を必須とする。
`previous_session_id`は更新では送らない。

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

### Offer応答

```json
{
    "sdp": "...",
    "type": "answer",
    "session_id": "01K1AF2Y0H0000000000000001",
    "offer_revision": 1
}
```

同じ要求IDと同じSDP バイト列の直列・並行再試行は、候補収集済みの同じAnswerとセッション IDを返す。
要求IDは受信したSDP バイト列のSHA-256へ結び付け、異なるSDPへの再利用を受理しない。
完了済み Answerと終了セッションの終了を示す記録は2分保持し、両者と処理中のものを合計1000件まで保持する。
期限内項目を容量都合で追い出ししない。有効セッションは作成予約を含めプロセス当たり100件までとする。

更新Offerはセッション単位で同時に1つだけの実行とし、Offer適用、Answer生成、候補追加を直列化する。
同じ改訂番号と同じSDPの完了後再試行には保存済みAnswerを返す。同じ改訂番号の異なるSDP、
旧改訂番号、1を超えて省略した未来改訂番号、初回と異なる要求ID、並行更新はHTTP 409とする。
成功時は既存`session_id`、`RTCPeerConnection`、DataChannel、処理工程と同じ改訂番号のAnswerを返す。
保存済み`talk_mode`と異なる有効値もHTTP 409とし、処理工程のモードは変更しない。

相手側の接続情報適用前の更新失敗は現在の改訂番号を維持して再試行可能とする。
適用後にAnswer生成または候補収集が失敗した場合はPion 切り戻しへ依存せずセッションを終了し、
未完成Answerをキャッシュしない。

### ICE候補の要求

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

`session_id`と`offer_revision`は必須で、現在受理済みの改訂番号だけを受理する。
候補収集の完了通知は明示的な`candidate: null`で送る。`candidate` フィールドの省略はHTTP 400であり、
`null`とは同一視しない。

候補の冪等キーは候補文字列の受信バイト列、`sdpMid`、`sdpMLineIndex`、
`usernameFragment`のタプルである。任意フィールドの省略と`null`は同一視するが、
文字列の前後の空白除去や事例変換は行わない。候補収集の完了通知も1件として重複排除する。
1 改訂番号当たり異なる候補は64件までとし、重複候補は上限へ加算せずPionへ再適用しない。

### ICE候補の応答

```json
{
    "status": true
}
```

受理または重複済み候補には`status: true`を返す。不明セッション、終了セッション、改訂番号競合は
それぞれHTTP 404、410、409とし、別セッションへ代替処理しない。

## エラーの扱い

- JSONの構文・型、フィールドの有無、UUID/ULID/revisionの形式、SDP/candidate不正はHTTP 400を返す。
- 不明セッションはHTTP 404、終了セッションと有効な初回Offer 終了を示す記録はHTTP 410を返す。
- 要求 ID/SDP/revision/`talk_mode`の競合と並行更新はHTTP 409を返す。
- HTTP 本文の1 MiB超過、SDPの256 KiB超過、候補文字列の8 KiB超過はHTTP 413を返す。
- セッション上限、初回Offer 登録簿上限、1 改訂番号の候補 64件超過はHTTP 429を返す。
- 候補収集が起動時設定の期限を超えた場合はHTTP 504を返し、失敗結果をキャッシュしない。
- 不正 DataChannel または想定外トラックはセッションプロセス側で終了対象とする。
- 候補の形式異常はログに残し、可能な範囲で接続継続を優先する。
- `expression_code` の未知値や欠落はフロント側で中立として扱う。

フロントエンドは400、409、413、応答解析・識別情報不一致、再試行回数の使い切りを当該PeerConnection
世代の回復不能な失敗として扱う。候補キューを破棄してPeerConnectionを終了し、
AppControllerの明示的な再開始またはページ再読み込みまで新セッションを自動作成しない。候補送信失敗も
単体破棄せず、同じ世代を失敗させる。

更新Offerまたは候補の404/410だけはサーバーセッション消失として扱う。既知の旧`session_id`を
`previous_session_id`に設定し、新しいPeerConnection、DataChannel、要求IDによる初回Offerへ
置き換える。送信用音声トラックは停止せず新PeerConnectionへ引き継ぐ。初回Offerの410は
応答から旧セッションを復元できないため回復不能な失敗とする。
409はrevision/request 識別情報競合であり条件を確認しない再試行しない。

## 時間切れ・再試行

- フロントエンドからPionへはTrickle ICEを使う。Pionからの候補はAnswer SDPへ収集して返すhalf-trickleとする。
- 識別情報付き初回OfferのHTTP 応答を失った場合は、同じ要求IDと同じSDPで再送する。旧形式の初回 Offerは同一Answer 再試行を保証しない。
- 更新OfferのHTTP 応答を失った場合は、同じセッション ID、要求ID、改訂番号、SDPで再送する。
- フロントエンドは更新 Answerを受け取るまで同改訂番号の候補をキューし、成功後に順序を保って送る。
- 候補キューはPeerConnection 世代ごとに最大64件のFIFOとする。容量超過、Offer失敗、
  候補送信失敗ではキューを全破棄し、世代を回復不能な失敗またはセッション消失時の
  接続資源一式の置き換えへ遷移させる。
- `disconnected`から10秒以内に自然復旧した場合はセッションを維持し、更新を要求しない。
- `failed`は即時、`disconnected`の10秒猶予時間超過は1回だけICE 再接続を開始する。Offer生成・送信・
  候補書き出しはPeerConnection単位の同時に1つだけの実行とし、連続イベントで並行Offerを作らない。
- ICE 再接続成功後は同じPeerConnection、DataChannel、処理工程世代で音声を再開する。
- Offer HTTPは1実行10秒、候補 HTTPは1実行5秒の中断時間切れを持つ。HTTP実行は最大4回
  （初回1回と再試行 3回）、全体期限は30秒とする。429、5xx、ネットワークエラーだけを再試行し、
  失敗した実行1/2/3の後は500ms、1秒、2秒を上限とする全待機範囲でのランダムな揺らぎ `[0, cap]` で待つ。
  `Retry-After`があれば揺らぎより優先する。
- 各HTTP実行の時間切れは操作固有時間切れと全体期限残時間の小さい方へ範囲制限する。
  残時間が0以下、または待機時間が残時間以上なら次のHTTP実行を開始しない。同じHTTP 再試行では
  直列化済み本文、SDP、要求ID、改訂番号を変更しない。
- 改訂番号なし初回 Answerは配信済みフロントエンドとの互換のため受理する。旧形式モードの切断では
  更新Offerを送らず、新しいPeerConnection/DataChannelで改訂番号なし初回接続を作り直す。

## バージョン管理

- 現時点では明示的な通信規約バージョンフィールドは持たない。
- 互換性に影響する変更はフロントエンド / バックエンド同時更新とし、`documents/design/index.md` の導線も更新する。

## 検証項目

| 観点        | 確認内容                                                 |
| ----------- | -------------------------------------------------------- |
| 設定        | `config.json` が offer / 候補 URL と ICE 設定を返す      |
| offer       | 初期・更新 Answer、改訂番号 retry/競合を処理できる       |
| 候補        | 改訂番号付き候補、null、重複排除、64件上限を処理できる   |
| DataChannel | 両チャネルが開くし、各チャネルの信頼性属性どおり受信する |
| 再接続      | 猶予期間・期限内の同一PeerConnection 再接続を確認する    |

## 参照

- `documents/design/backend/services/sincro-rtc.md`
- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/networking_rtc.md`
