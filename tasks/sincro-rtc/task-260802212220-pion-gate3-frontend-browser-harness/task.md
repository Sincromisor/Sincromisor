# Pion Gate 3現行Frontendブラウザーハーネスを実装する

## 背景 / 目的

現行Frontendを管理対象Chromiumで操作し、初回接続、会話、同一sessionのICE restart、
シグナリングHTTP障害を再現可能にする。ICE restart開始条件はHTTP応答の保持では作れないため、
Playwrightの初期化scriptで実`RTCPeerConnection`の状態イベントを決定的に発火させる。

## 完了条件（受け入れ条件）

- [ ] rootへ`@playwright/test` 1.54.2を固定し、`playwright.gate3.config.ts`と
      `sincromisor-frontend/tests/gate3/pionRtcGate3.spec.ts`を追加する。
- [ ] 現行`/simple-vrm/index.html`を、偽microphoneと固定WAVを使う管理対象Chromiumで操作し、
      initial Offer、candidate、`text_ch`、`telop_ch`、確定利用者text、応答text、合成音声の1 turnを観測する。
- [ ] `page.addInitScript`でnative `RTCPeerConnection` constructorを包み、ページが作った実instanceを
      test側だけで捕捉する。捕捉したinstanceの`iceConnectionState`を一度だけ`failed`として返し、
      `iceconnectionstatechange`をdispatchして現行Frontendのrestart処理を開始する。
- [ ] restart開始後は状態偽装を解除し、実instanceが作る`createOffer({iceRestart:true})`、
      update Offer、revision 2、同一session ID、既存DataChannel、復旧後の2 turn目を
      HTTP台帳・Pion statuses・browser観測の3者で確認する。
- [ ] 状態イベントのdispatchだけ、またはbrowser内部の自己申告だけでは合格にしない。
      update Offerが発生しない、session IDが変わる、DataChannelを再作成する、実ICE状態が復旧しない場合はerrorにする。
- [ ] `internal/gate3/signalingproxy`は`offer`と`candidate`のrequest / responseをbyte台帳へ保存し、
      response drop、404、409、410、429、5xx、delayの有限応答列を操作単位に適用する。
      scenario終了時の未消費規則はerrorにする。
- [ ] GoとPlaywrightは権限`0600`の入力・出力JSONだけで調停し、標準出力を制御protocolに使わない。
      schema不一致、scenario ID不一致、複数出力、非0終了、期限超過はerrorにする。
- [ ] 本番Frontend source、production constructor、公開global objectへtest接続点を追加しない。
- [ ] 変更対象と変更理解範囲のコメント点検を`impl.md`へ全件記録する。

## 設計判断（着手前に確定済み）

- 初期化scriptはnative constructorと`iceConnectionState` getterを保存し、捕捉対象の1 instanceだけに
  一時的なgetterを設定する。`failed` eventを1回dispatch後、own propertyを削除してnative getterへ戻す。
- constructorの捕捉数が1でない、property descriptorが`configurable`でない、instanceが既にclosedなら
  testをerrorにする。別方式へ暗黙にfallbackしない。
- `RTCPeerConnection.restartIce()`をtest側から直接呼ばない。現行Frontendの
  `handleRtcIceConnectionState → recoverFromIceFailure → runRestartNegotiation`を通す。
- Chromiumが接続する唯一のHTTP originはGoのreverse proxyとする。Frontend static、
  `config.json`、`offer`、`candidate`、statuses、metricsをsame-originで透過する。
- browser入力JSONは`schema_version`、`scenario_id`、`base_url`、`chromium_executable`、
  `audio_fixture`、`deadline_ms`、`operations`を必須にする。出力はsession ID列、接続状態列、
  DataChannel、turn、restart、停止の観測時刻を必須にする。
- page ready 15秒、initial接続15秒、1 turn 60秒、restart 30秒、2 turn 60秒、停止10秒に固定する。

## スコープ境界

- 本タスク: Playwright調停、browser JSON契約、HTTP reverse proxy、シグナリング応答注入、2 turn。
- 依存タスク: 契約下流サービスと共通process・成果物基盤。
- 後続タスク: 実4サービス、本番Gate集約、境界クライアント、process restart。
- スコープ外: Firefox、NAT、OS network impairment、Frontend本番API変更、Pythonサービス変更。

## 高リスク統合タスクの追加設計

| イベント       | 発生元                 | 合否の外部観測                             |
| -------------- | ---------------------- | ------------------------------------------ |
| `failed`の模擬 | Playwright初期化script | 現行Frontendがupdate Offerを送る           |
| ICE restart    | 実`RTCPeerConnection`  | revision 2、同一session ID、実接続状態復旧 |
| 2 turn目       | 現行Frontend           | HTTP台帳、下流台帳、既存DataChannel受信    |

test scriptはrestartの開始条件だけを作る。Offer生成、HTTP送信、Answer適用、candidate、DataChannel、
会話はproduction経路を差し替えない。初期化scriptのcleanupはpage/context終了前に行う。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/features/rtc/rtcTalkClient.ts:248-282`が`failed`からrestartを開始する。
- `sincromisor-frontend/src/features/rtc/rtcConnectionStateHandler.ts:14-56`が状態イベントを
  recovery intentへ変換するため、初期化scriptはこの既存経路を通す。
- `sincromisor-frontend/src/features/rtc/rtcPeerConnectionEvents.ts:64-75`がnative propertyを読み、
  owner callbackへ渡す。
- `sincromisor-frontend/src/features/rtc/rtcNegotiation.ts:56`が
  `createOffer({iceRestart: true})`を実行する。Playwright側でOfferを生成しない。
- `sincromisor-frontend/src/features/rtc/rtcSignalingHttp.ts:65-115`の最大実行回数と
  operation別分岐を有限応答列の期待値に使う。

## テスト

- Frontendのlint、typecheck、test、buildを通す。
- module rootで`go test -race -tags=gate3 ./internal/gate3/signalingproxy`と、
  契約サービスを使うbrowser結合試験を管理対象Chromiumで実行する。
- 初期化scriptのconstructor捕捉、getter復元、単発dispatch、update Offer非発生時errorを
  Playwright試験で固定する。
- `go vet -tags=gate3 ./...`、tagなしの`go test ./...`、root `npm run gate`、
  `npm run tasks:check`を通す。

## ソースコードコメント受け入れ条件

Playwright初期化script、browser JSON境界、reverse proxy、有限応答列、cleanup所有者を全件点検する。
native APIを一時変更する理由、変更範囲、復元条件、外部観測が必要な理由を説明し、
規約所定の9列を`impl.md`へ記録する。

## ドキュメント同期の要否

要。`internal/gate3/README.md`へChromium準備、固定WAV、browser JSON、決定的なrestart発火方法、
production経路を差し替えない合否境界を追記する。公開Frontend APIは変更しない。

## 文書の言語

説明文と表見出しは一般的な日本語を用い、Web API名、JSON field、HTTP statusだけ原表記を残す。
