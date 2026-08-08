# Pion Gate 3現行Frontendブラウザーハーネスを実装する

## 背景 / 目的

現行Frontendを管理対象Chromiumで操作し、通常会話と同一session内のICE restartをproduction経路で確認する。
HTTP status別の分岐は既存Frontend単体試験を正本とし、本タスクではブラウザーでしか確認できない縦切りに限定する。

## 完了条件（受け入れ条件）

- [ ] rootへ`@playwright/test` 1.54.2を固定し、Gate 3用configと1つのspecを追加する。
- [ ] `-tags=gate3`のGo統合試験を1つ追加し、既存`harnessenv`、`pipelinecontract`、`consuldev`、
      `process.Owner`だけでFrontend build済み入力、4契約service、Consul、Pion、Playwrightを調停する。
- [ ] 現行`/simple-vrm/index.html`を偽microphoneと固定WAVで操作し、initial Offer、candidate、
      `text_ch`、`telop_ch`、利用者text、応答text、合成音声の1 turnを観測する。
- [ ] `page.addInitScript`からページが生成した実`RTCPeerConnection`へ`failed`イベントを一度だけ発火し、
      productionのrestart処理がupdate Offerを送ることを確認する。test側から`restartIce()`は呼ばない。
- [ ] restart後にrevision 2、同一session ID、既存DataChannel、実ICE状態の復旧、2 turn目の完走を確認する。
- [ ] test用接続点をFrontend本番sourceや公開global objectへ追加しない。

## 設計判断

- Go統合試験を最上位ownerとする。Frontendは事前にbuild済みとし、統合試験が4契約service、Consul、
  Pion、Playwrightをこの順に起動する。Playwright終了後はPlaywright、Pion、Consul、契約serviceの逆順で
  cleanupし、途中失敗時も起動済みownerを同じ順序で必ずjoinする。
- Pion processは既存`cmd/pion-poc`を検査済みGo binaryで一時directoryへbuildして起動する。
  Pion自身のFrontend static/API same-origin配信を使い、local proxyは追加しない。
- ChromiumはPlaywrightだけが起動・終了し、`SINCRO_GATE3_CHROMIUM_BINARY`を`executablePath`へ渡す。
  偽microphoneは`--use-fake-device-for-media-stream`、`--use-fake-ui-for-media-stream`、
  `--use-file-for-fake-audio-capture=<固定WAV>`で構成する。
- GoからPlaywrightへ渡す値は既存`SINCRO_GATE3_*`と、test専用のbase URLだけに限定する。
  Playwrightのreporterと終了codeをそのまま合否に使い、JSON制御protocol、応答file、汎用byte台帳は作らない。
- 404、409、410、429、5xx、timeoutの分岐は既存の`rtcSignalingHttp.test.ts`と
  `rtcTalkClient.test.ts`で確認し、ブラウザー試験へ重複させない。
- `page.addInitScript`はnative constructorを保存し、最初の`RTCPeerConnection`生成直後にconstructorを復元する。
  捕捉した1 instanceとその`text_ch`/`telop_ch`だけをclosureに保持し、公開global propertyは作らない。
  Playwrightとのtest内連携には一意な`CustomEvent`を使い、page/context終了時にlistenerを削除する。
- `failed`発火時だけ対象instanceへ`iceConnectionState`のown getterを設定し、
  `iceconnectionstatechange`を1回dispatchした`finally`でown propertyを削除する。test側から
  `restartIce()`、`createOffer()`、signaling `fetch()`は呼ばない。

## 合否の正本観測

- initial/update OfferとcandidateはPlaywrightのrequest eventで実HTTP bodyを採取する。initialはrevision 1、
  updateはrevision 2・同一`offer_request_id`・initial responseと同じ`session_id`、candidateは各accepted revisionを
  確認する。DOM表示やtest内の自己申告だけをsignaling成功の根拠にしない。
- DataChannelは初期化scriptが`createDataChannel()`の実戻り値を参照同一性で保持する。restart前後を通じて
  `text_ch`と`telop_ch`が各1 instanceだけで、追加生成されず、両方の実`message` eventを受信したことを確認する。
- 各turnはbrowser側で確定利用者text`固定文`、応答text`固定された応答文`、`telop_ch`受信を確認する。
  合成音声はremote audio trackのWeb Audio sampleに非silenceが現れたことをbrowser側で確認する。
- Go側はPlaywright成功後に`pipelinecontract.Transcript()`を確認し、2 attemptそれぞれが
  Extractor→Recognizer→Processor→Synthesizerの4段を完了し、同一pipeline session、連続sequence、
  Processor→Synthesizerのbyte同一性を満たすことを正本とする。`Verify`はこの2正常turnを受理するよう最小拡張する。
- restart復旧はgetter削除後のnative `RTCPeerConnection.prototype.iceConnectionState`が
  `connected`または`completed`へ戻ったこと、revision 2 update Offer、既存DataChannel、2 turn目の全観測が
  同時に成立した場合だけPASSとする。

## 所有時間と失敗条件

- frontend/Pion readiness 15秒、initial接続15秒、各turn 60秒、restart 30秒、Playwright終了10秒、
  cleanup 10秒を段階別上限とする。Playwright全体timeoutはこれらを包含する180秒とする。
- Pionは`/api/v1/RTCSignalingServer/statuses`の`ready=true`、pageは`開始する`button表示をreadinessとする。
- 期限超過、`RTCPeerConnection`捕捉数が1以外、捕捉instanceの`signalingState=closed`、
  getter変更不能、failed dispatch複数回、constructor/getter/listener復元失敗、update Offer欠落、
  子process非0終了、契約台帳不一致、cleanup/join失敗をtest failureにする。

## スコープ境界

- 本タスク: Playwright設定、最小のGo統合owner、通常1 turn、ICE restart、復旧後1 turn、
  2正常turnを受理する契約台帳検証。
- スコープ外: HTTP status matrix、Firefox、NAT、OS network impairment、Frontend本番API変更。

## テスト

- `npm run gate`でFrontend buildを含むroot gateを通した後、module rootで
  `go test -tags=gate3 ./internal/gate3/browser -run '^TestFrontendBrowserHarness$' -count=1 -v`を実行する。
- 上記Go統合試験が管理対象ChromiumのPlaywright spec、2 turn、ICE restart、全owner cleanupを実行する。
- Frontendのlint、typecheck、test、buildを通す。
- module rootのtagなし`go test ./...`、root `npm run gate`、`npm run tasks:check`を通す。

## ソースコードコメント受け入れ条件

本番sourceは変更しないため、ソースコードコメント点検は対象外とする。
初期化scriptにはproduction経路を差し替えない理由、捕捉範囲、propertyとlistenerの復元条件を記録する。
新しいtest ownerと境界helperのコメントは`documents/rules/source-comments.md`を正本として確認する。

## ドキュメント同期の要否

要。`internal/gate3/README.md`へ必要環境、Chromium、固定WAV、実行command、owner順序、
restart発火方法、合否の正本観測を追記する。
公開Frontend APIとRTC契約は変更しない。

## 文書の言語

説明文は日本語を用い、Web API名、識別子、HTTP statusだけ原表記を残す。
