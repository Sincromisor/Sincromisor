# リスクと判断事項

## Summary

- 最大の技術リスクはOpus codec、timing、Go版pipeline orchestration、cross-language contractである。
- Python adapterを常設しないため追加hopは避けられるが、現行AudioBrokerの全体系再接続、queue、close semanticsをGoで再構成する必要がある。
- Protocol BuffersとOpenAPI生成は別initiativeへ分離し、Pion移行では既存MessagePackと手書きsignaling schemaの互換を優先する。
- Phase 1はlocal Chromeの基本経路だけで採用判断し、production運用リスクはPhase 3 / 4で段階的に解消する。

## リスク一覧

| リスク                          | 影響                       | 対策                                                      |
| ------------------------------- | -------------------------- | --------------------------------------------------------- |
| PionがPCM codecを内包しない     | 音声経路を追加実装         | pure Go decode + mediadevices static Opus encodeを最小PoC |
| cgo / native codecの資源解放    | leak、process crash        | 10 close / raceをPoC、profile / sanitizerを切替前に実施   |
| 1 processへのsession集約        | process停止で全session切断 | supervisor restart、readiness、close timeout、session上限 |
| RTP timestamp / pacing不整合    | 音切れ、速度異常           | golden audio、timestamp test                              |
| 入力track依存clockの喪失        | 合成音声停止、同期ずれ     | Goが独立outbound clockを所有                              |
| AudioBroker semanticsの移植漏れ | 重複処理、古い応答の後送   | pipeline一括reset、generation gate、queue破棄             |
| MessagePackの型不一致           | runtime decode error       | 双方向golden fixture                                      |
| Go / Python contract同時刷新    | 原因切り分け不能           | MessagePack維持、protocol刷新は別initiative               |
| sessionごとのWebSocket増加      | memory、fd増加             | connection budgetを測定                                   |
| queue増大                       | latency、memory増加        | bounded queueと用途別drop policy                          |
| session close競合               | goroutine / socket残存     | context、close-once、timeout                              |
| ICE restart / candidate世代差異 | stale candidate混入        | `offer_revision` をOffer / candidateへ付与                |
| server candidate通知経路の欠落  | ICE接続不能                | Pion側だけnon-trickleにするhalf-trickle Answer            |
| initial Offer response消失      | session重複                | `offer_request_id`、SDP hash、AnswerのTTL cache           |
| 接続未成立session               | PeerConnection / WS残存    | pre-connect deadline、pipeline client遅延作成             |
| RTCP未処理                      | feedback滞留、品質低下     | report interceptor、RTCP drain loop、NACK / PLC試験       |
| 境界入力の暴走                  | memory増加、panic          | body / SDP / candidate / queue上限、goroutine recovery    |
| browser実装差                   | Chromeのみ成功             | ChromeをPoCと切替前gateで確認し、他browserは実害時に確認  |
| DataChannel backpressure        | memory増加、message欠落    | buffered amount監視と上限                                 |

## 主要判断事項

### WebRTC media network

Phase 1はlocal host candidateだけを使い、fixed UDP mux、public IPv4 rewrite、Docker / NAT / firewallを
採用判断の前提にしない。production候補では1 Pion instance、固定UDP mux、
`SetICEAddressRewriteRules` によるhost candidateのpublic IPv4置換、UDP4 / Full ICEを実装し、
Phase 4で検証する。TURNは初期対象外とする。

メリット:

- Docker mappingとfirewallを固定TCP endpointと1つのmedia UDP portへ限定できる。
- container IPをSDPへ誤って載せず、直接接続経路を再現可能に検証できる。
- session数に応じたport range管理と複数instanceのport競合を実装しなくてよい。

デメリット:

- public IPv4と静的port forwardを設定できない環境では接続できない場合がある。
- IPv6-only環境と複数instanceを初期対象にできない。
- restrictive NAT / firewallをTURNで回避する経路を保証しない。

single-port ICE-TCPはPoCでUDP失敗時の接続改善がChrome / Firefoxと展示相当networkで確認できた場合だけ採用する。外部service費用は発生しないが、listener、firewall、candidate matrixが増えるため必須Gateにはしない。

### Signaling方向とinitial Offer冪等性

現行HTTP endpointを維持し、FrontendからPionへはTrickle ICE、PionからFrontendへはcandidate収集完了後のAnswerを返すhalf-trickleを採用する。Server→Frontendのcandidate通知endpointは追加しない。

Phase 1は現行Frontendを変更せずinitial Offerだけを扱い、session ID付きupdate Offerを501とする。
unknown / closed sessionのcandidateは200 + `status:false` で拒否する。

`offer_request_id`、SDP hash、Answer TTL cache、`offer_revision` はPhase 3でFrontendと同時に導入する。

メリット:

- 現行のrequest / response signalingだけでPion側candidateを確実にAnswerへ含められる。
- HTTP response消失時にsessionと下流資源を重複作成しない。

デメリット:

- candidate収集完了を待つ分だけ初回Answerのlatencyが増える。
- request ID cacheとtombstoneのTTL / 上限管理が必要になる。

### aiortc / Pion切り替え

運用環境で両backendを共存させず、メンテナンス時間に停止切替する。Pion稼働中もaiortcのrollback imageは保存するがserviceは起動しない。

メリット:

- signaling stickiness、割合router、backend間session registry、session ID namespace分離が不要になる。
- Offerとcandidateは常に起動中の1 backendへ届き、未知sessionを別backendの新規sessionへfallbackさせる経路がなくなる。
- compose、監視、障害切り分けが単純になる。

デメリット:

- 切替とrollbackに停止時間が発生し、active sessionは失われる。
- 同一時刻のreal trafficでaiortcとPionを比較するcanaryはできない。
- rollback後に利用者は新しいsessionへ接続し直す必要がある。

### ICE restartとcandidate generation

ICE restart / update Offerは最小PoCへ含めずPhase 3で実装する。同じPeerConnection、pipeline、
session IDを維持し、Offer、Answer、candidateへ単調増加する `offer_revision` を追加する。
Frontendは `disconnected` のgrace period中は自然復旧を待ち、`failed` またはgrace超過時だけsingle-flightでrestartする。

メリット:

- 通常のnetwork断でsession IDが変わらず、音声・認識ログを同じsession単位で追跡できる。
- pipelineと確定済みchat historyを維持したままmedia transportだけを再確立できる。
- end-of-candidatesを含め、遅延candidateをrevisionで決定的に拒否できる。

デメリット:

- Offer / Answer / candidate schema、Frontendのrevision管理、Pionのstale判定が増える。
- update Offer中のsignaling stateとcandidate queueをtestする必要がある。
- RTC serverからsession state自体が失われた場合は新規sessionが必要であり、その場合だけsession IDが変わる。

aiortcはrollback専用backendとして新fieldを無視し、FrontendはaiortcのrevisionなしAnswerを期限付きで許容する。aiortcへ同じ状態機械を実装せず、rollback時はページreload後の新規session成立だけを保証する。

### 接続未成立sessionとmedia lifecycle

Offer受付後はcandidate収集、ICE / DTLS確立、audio track / 必須DataChannel readinessへ独立した有限deadlineを設ける。pipeline clientはmedia readiness後に遅延作成し、deadline超過はclose-once経路へ統合する。

RTP reader / writerとoutgoing RTCP drain loopをsession contextで管理する。Sender / Receiver Reportを明示設定し、NACKはbounded historyとOpus PLCをPhase 1で比較してGate 1までに採否を固定する。sequence / timestamp wraparound、bounded reorder、late packet破棄、scheduler遅延後のnon-burst pacingを実装要件とする。

### Pipeline再接続

1 serviceの障害でも4 pipeline clientを一括resetする。queueとin-flight requestは破棄して再送せず、内部 `pipeline_generation` が一致するresultだけに副作用を許可する。再接続は1秒開始、最大30秒の指数backoffにfull jitterを加えてsession終了まで継続する。

メリット:

- service別の部分復旧に伴う依存状態、再送順序、重複TTS、古いtelopの組み合わせを持たなくてよい。
- generation checkにより、closeと並行して到着した古いcallbackをコード上で拒否できる。
- 現行AudioBrokerの全体系再接続に近く、behavior差を小さくできる。
- downstream serviceや展示networkが長時間不安定でも、人手を介さず復旧を継続できる。

デメリット:

- 1 serviceだけの短い障害でも処理中の全pipeline stateを失う。
- partial recognitionと処理中発話を復元しないため、利用者が発話を繰り返す場合がある。
- at-least-once deliveryや途切れない会話継続は保証しない。
- 長時間障害では全sessionが最大30秒間隔で再試行し続けるため、下流serviceへの継続負荷が発生する。

### Pionを採用するか

Phase 1の採用条件:

- local host candidateでChromeの双方向音声とDataChannelが成立する。
- pure Go Opus decodeとmediadevices/static libopus encodeが成立する。
- 10回close、codec error、SIGTERM、race testでsession resourceが収束する。

管理対象Chrome、fixed UDP mux、Go pipeline互換はPhase 3 / 4の切替条件であり、
Pionを後続実装の出発点にする判断とは分離する。

不採用条件:

- codec経路が配布・運用上許容できない。
- browser interoperabilityを維持できない。
- session lifecycleを安定してcloseできない。
- 現行pipeline semanticsをGoで安全に再現できない。

### `VoiceTransformTrack` をどう置き換えるか

同名classをGoへ移植せず、次へ分割する。

- remote RTP reader
- audio decoder / resampler
- conversation coordinator
- outbound audio clock / RTP writer
- DataChannel dispatcher

aiortcの `recv()` pull modelを模倣しない。browser入力と合成音声出力を独立させることを採用条件とする。

### AudioBrokerをGo化するか

最終構成ではGo化する。AudioBrokerの主要責務は推論ではなく、WebSocket、queue、retry、service discovery、session lifecycleであり、Go RTC serverと同じownershipへ置く方がcloseとbackpressureを一貫して管理できるためである。

ただしPython classを逐語的に移植しない。Conversation Coordinatorとservice別Pipeline Clientへ責務分離する。

### codec実装

Phase 1は inbound に `github.com/pion/opus` のpure Go decoder、outbound に
`github.com/pion/mediadevices/pkg/codec/opus` の同梱static libopus encoderを使う。
`dynamic` build tagとsystem libopusは使わず、cgo範囲をencoderへ限定する。

この経路が成立しない場合だけ、失敗したcodec adapterについてGStreamerを小さな後続taskで比較する。

判断軸:

- 音質とpacket loss時の挙動
- encode / decode latency
- session当たりmemory
- CPU
- native resource解放
- container image size
- multi-architecture build
- debuggingとmetrics

### 初期pipeline protocol

既存WebSocket + MessagePackを採用する。Pion、codec、Go orchestration、下流protocolを同時に変更すると、障害原因を分離できないためである。

見直し条件:

- Go DTOの維持が明らかな開発負債になる。
- MessagePackの言語差により互換性を保証できない。
- 既存contractにGoで表現困難なPython固有型がある。

互換性を保証できないmodelだけを先行して言語非依存表現へ変更する場合は、contract変更としてfrontendや全consumerへの影響を確認する。

### Pipeline契約をIDL化するか

Pion移行ではIDL化しない。既存MessagePackと双方向golden fixtureを維持し、Go DTOの負債や互換性問題が実害になった場合だけ別initiativeでProtocol Buffersなどを比較する。

### DataChannel payloadをGoで検証するか

Goはaudio同期に必要なspeech IDとsample位置を理解するが、application payloadは可能な範囲でopaque relayとする。

次が必要になった場合だけapplication schema validationを追加する。

- content-based routing
- RTC serverでのprotocol変換
- application field単位のmetrics
- untrusted producerへの防御

payload size、channel、UTF-8、timing範囲、buffered amountは初期段階から検証する。

## 代替案

### Python adapterを常設する

既存AudioBrokerを再利用しやすいが、PCM copy、WebSocket hop、queue、failure boundary、metrics対象が増える。codec PoCの一時bridge以外では採用しない。

### aiortcを継続する

PoCが不合格の場合の最小リスク案。現行構成のprofileとlifecycle改善を続け、aiortc更新を追従する。ただし、Pythonとmedia transportの密結合は残る。

### GStreamer WebRTCへ移行する

codecとmedia pipelineの安定性を優先する場合の候補。`webrtcbin` がsignaling、media、DataChannelを扱えるが、GObject / pipeline運用への移行が必要になる。

### webrtc-rsへ移行する

Rustでmemory safetyとresource controlを重視する場合の候補。APIの安定性、開発コスト、codec統合を再評価する必要がある。

### LiveKitなどへ全面移行する

room、participant、SFU、水平scaleが必要になった場合の別initiativeとする。現行1対1会話のRTC library置換と同じscopeでは扱わない。

## ADR化する判断

次は対応phase完了後にADRへ記録する。

- Pion採用または不採用
- codec実装の選択
- half-trickle signalingとinitial Offer冪等性
- `VoiceTransformTrack` / AudioBrokerのGo再構成
- 初期MessagePack互換方針
- aiortc rollback期間と削除条件

ADRには実測値の転載ではなく、対応taskへの参照、採用理由、棄却理由、見直し条件を残す。
