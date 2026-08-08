# Pionの固定UDP muxとpublic IPv4設定を実装する

## 背景 / 目的

Phase 3のPion serverはlocal接続用のICE設定だけを持ち、production相当環境で必要な固定UDP portと
advertised public IPv4を設定できない。Phase 4の実地確認へ進めるよう、Pion processが1つのUDP socketを
全sessionで共有する最小のproduction network境界を実装する。

## 完了条件（受け入れ条件）

- [ ] media UDP bind address、advertised public IPv4、利用interfaceを起動引数で受け取る。bind addressは
      指定interfaceに割り当て済みかつwildcardでないIPv4、portは1〜65535、interfaceはUPでなければならない。
      advertised IPはunspecifiedでないIPv4とし、実際のpublic到達性は検査しない（local結合試験ではloopbackを許可する）。
      これらの不正値、存在しないinterface、`turn:` / `turns:` URLはHTTP listenerを開く前に拒否する。
- [ ] process起動時にUDP4 socketを1つだけ開き、Pionの全PeerConnectionが同じICE UDP muxを共有する。
      SDPのhost candidateには指定したpublic IPv4と固定portが載り、container/private addressは載らない。
- [ ] network typeをUDP4に限定し、指定interface以外をcandidate収集対象にしない。IPv6、TURN、ICE-TCPは
      暗黙に有効化しない。
- [ ] `--gather-timeout`はprocess共有APIの固定ICE gather timeoutとする。HTTP requestのdeadlineはOffer処理だけを
      中断し、共有APIやUDP muxをcloseしない。
- [ ] UDP muxは起動成功後のUDP socket唯一のclose ownerとする。起動途中でmuxへ渡す前の失敗だけは
      `cmd/pion-poc`がsocketをcloseし、通常終了では全sessionとOffer ownerの収束後にmuxを一度だけcloseする。
      session close timeoutでもmuxはprocess shutdownまで開いたままとする。
- [ ] local UDPで2 sessionを作る結合テストにより、同じportのcandidate、接続成立、終了後のsocket closeを確認する。

## 設計判断

- process単位の`webrtc.API`とICE UDP muxを既存Managerへ注入し、sessionごとにlistenerを作らない。
- bind addressとinterfaceの組合せは曖昧にしない。wildcard bindは許可せず、指定interface自身がbind IPv4を
  保有する場合だけ起動する。advertised IPはNAT外側の到達性をローカルで判定できないため、IPv4構文だけを検証する。
- UDP socketの所有権はmuxへ移し、socketとmuxを別経路でcloseしない。起動中の所有権移転前だけmainがcloseし、
  実行中はshutdown処理がmuxをcloseする。
- 設定可能にするのは実機差があるbind address、public IPv4、port、interfaceだけとする。
  TURN、IPv6、複数instance、ICE-TCPは追加しない。

## スコープ境界

- 本タスク: Go起動設定、process共有のPion network API、socket lifecycle、関連テストとREADME。
- スコープ外: Docker/compose wiring、firewall変更、production相当NATでの実測、性能比較。

## 実装方針

`internal/config`で設定を検証し、`cmd/pion-poc`でUDP socket、mux、Pion APIを所有する。現在
`internal/rtc/session.go`でsessionごとに生成している`SettingEngine`は、`--gather-timeout`を固定値として持つ
process共有設定へ置き換える。HTTPのOffer deadlineと共有ICE gather timeoutは独立させる。

## テスト

- `go test -race ./internal/config ./internal/rtc ./cmd/pion-poc`
- `go vet ./...`
- rootの`npm run gate`

実NAT、Chrome / Firefox、firewallはPhase 4リハーサルtaskだけで確認し、このタスク用のnetwork harnessは作らない。
必須確認が失敗した場合は、失われうるlog・socket状態・対象commitを先に採取し、直接原因を特定して最小再現、
修正、失敗した確認、全体gateの順で再検証する。原因を別taskへ移す場合は、原因・証拠・移管理由・後続task IDを
記録し、ユーザーの了承を得るまで本タスクを完了にしない。

## ドキュメント同期の要否

要。`sincromisor-server/sincro-rtc-pion-poc/README.md`の起動引数と
`documents/migration/pion/rollout-and-operations.md`の設定名を実装へ同期する。公開HTTP / DataChannel契約は変えない。
