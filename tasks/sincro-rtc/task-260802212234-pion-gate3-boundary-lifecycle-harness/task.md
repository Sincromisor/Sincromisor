# Pion Gate 3境界クライアントと終了系ハーネスを実装する

## 背景 / 目的

現行Frontendでは生成できない接続準備失敗と、browser UIを必要としないprocess終了・session上限を、
テスト専用Go WebRTCクライアントで検証する。Frontend互換性の証拠と混同せず、
本番Pion adapter後のstatus、metric、資源収束を合否に使う。

## 完了条件（受け入れ条件）

- [ ] `internal/gate3/boundaryclient`に、同じHTTP reverse proxyだけへ接続するテスト専用clientを実装する。
      offer / candidateのschemaと固定データはrepository内の契約型を再利用し、別実装を作らない。
- [ ] `answer-held`、`audio-no-rtp`、`missing-text-ch`、`missing-telop-ch`を生成し、それぞれ
      ICE / DTLS、audio readiness、必須DataChannel readinessの期限でsessionがcloseし、
      下流WebSocket 0と資源収束を観測する。
- [ ] candidate gathering用clientはcase専用の応答しないUDP STUN listenerへPionを接続し、
      request受信を確認したうえでHTTP 504、未完成Answer非cache、session 0を観測する。
- [ ] graceful shutdown caseはactive session成立後にPion子プロセスへSIGTERMを送り、
      `/statuses`の`draining=true`を観測してから1秒以内に新規initial Offerを送り503を得る。
      既存session 0と5秒以内のprocess終了まで確認し、接続拒否を503の代替にしない。
- [ ] session上限caseは同一processへ100 sessionを成立させ、101件目だけが429、
      statusesが`sessions=100, session_limit=100`となることを確認する。終了時は100 session全てを回収する。
- [ ] process再起動caseは検証済み本番実行ファイルを強制終了し、`Wait`後5秒以内に同じargvで再起動、
      readiness復旧、新しいsession受理、旧PID不存在を確認する。
- [ ] client終了時はPeerConnection、DataChannel、candidate送信workerを全てjoinし、
      scenario間に接続や規則を持ち越さない。
- [ ] 変更対象と変更理解範囲のコメント点検を`impl.md`へ全件記録する。

## 設計判断（着手前に確定済み）

- client構成は`Mode` enumで`normal`、`answer-held`、`audio-no-rtp`、
  `missing-text-ch`、`missing-telop-ch`の5値に固定する。任意SDP入力は受理しない。
- negative caseはPeerConnection、audio transceiver、DataChannelの構成だけを直接作る。
  HTTP request / response、candidate identity、session ID解釈は既存契約型を使う。
- graceful shutdownは依存タスクが確定するlistener維持期間を使う。signal前からrequestを保持する
  回避策や、接続拒否との競争を合格値にしない。
- 本番実行ファイルは共通基盤が`SINCRO_GATE3_GO_BINARY`の絶対pathでbuildしたものだけを使う。
  `go test`実行ファイルや補助processを再起動の証拠にしない。
- boundary clientの結果はPion接続準備・終了契約の証拠に限定し、現行Frontendの証拠へ流用しない。

## スコープ境界

- 本タスク: Go境界client、接続準備失敗、draining、上限、強制終了・再起動。
- 依存タスク: 共通process・資源基盤、本番graceful shutdown順序。
- 後続タスク: 固定scenario集約と実4サービスGate。
- スコープ外: Frontend、pipeline障害、シグナリングretry matrix、production constructor変更。

## 高リスク統合タスクの追加設計

| case | 操作主体 | 本番境界での一意な期待値 |
| --- | --- | --- |
| `answer-held` | 境界client | ICE / DTLS期限close、下流0 |
| `audio-no-rtp` | 境界client | audio readiness期限close、下流0 |
| DataChannel欠落 | 境界client | 対応channel期限close、下流0 |
| draining | process監督 + 境界client | `draining=true`後のinitial 503、5秒内終了 |
| capacity | 境界client 101個 | 100 active、101件目429 |
| restart | process監督 | old `Wait`後5秒内ready、新session |

各caseはHTTP台帳、statuses、metrics、資源終端sampleを必須とし、client内部状態だけで合格にしない。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/features/rtc/rtcPeerConnectionFactory.ts:24-59`と
  `rtcDataChannels.ts:25-75`は正常構成を常に作るため、負の構成をFrontendへ追加しない。
- `sincromisor-server/sincro-rtc-pion-poc/internal/signaling/http.go:200-300`の
  production offer境界と`:303-340`のstatuses / readinessを観測する。
- `sincromisor-server/sincro-rtc-pion-poc/internal/rtc/lifecycle.go:17-85`の各期限とclose reasonを期待値に使う。
- `sincromisor-server/sincro-rtc-pion-poc/internal/config/config.go:18-23,51-78`の上限100と
  5秒終了契約を変更しない。

## テスト

- `go test -race -tags=gate3 ./internal/gate3/boundaryclient`で5構成のSDP、DataChannel、
  reverse proxy限定、worker joinを確認する。
- 実Pion子プロセスとの結合試験でcandidate gathering、4 readiness case、draining、
  capacity、restartを個別に実行する。
- `go vet -tags=gate3 ./...`、tagなしの`go test ./...`、root `npm run gate`、
  `npm run tasks:check`を通す。

## ソースコードコメント受け入れ条件

client mode、PeerConnection構成、Answer保持、RTP非送信、candidate worker、process監督、
各終了順序を全件点検し、規約所定の9列を`impl.md`へ記録する。負の状態を作る理由と
production Frontendの証拠にしない境界をコメントで明示する。

## ドキュメント同期の要否

要。`internal/gate3/README.md`へ各mode、適用するscenario、本番境界の観測点、
Frontend互換性へ流用しない制約を追記する。公開RTC契約は変更しない。

## 文書の言語

説明文と表見出しは一般的な日本語を用い、case ID、API名、HTTP statusだけ原表記を残す。
