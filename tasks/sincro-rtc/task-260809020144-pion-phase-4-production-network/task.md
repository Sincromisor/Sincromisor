# Pionの固定UDP muxとpublic IPv4設定を実装する

## 背景 / 目的

Phase 3のPion serverはlocal接続用のICE設定だけを持ち、production相当環境で必要な固定UDP portと
advertised public IPv4を設定できない。Phase 4の実地確認へ進めるよう、Pion processが1つのUDP socketを
全sessionで共有する最小のproduction network境界を実装する。

## 完了条件（受け入れ条件）

- [ ] media UDP bind address、advertised public IPv4、利用interfaceを起動引数で受け取り、不正なIP、port、
      存在しないinterface、`turn:` / `turns:` URLはHTTP listenerを開く前に拒否する。
- [ ] process起動時にUDP4 socketを1つだけ開き、Pionの全PeerConnectionが同じICE UDP muxを共有する。
      SDPのhost candidateには指定したpublic IPv4と固定portが載り、container/private addressは載らない。
- [ ] network typeをUDP4に限定し、指定interface以外をcandidate収集対象にしない。IPv6、TURN、ICE-TCPは
      暗黙に有効化しない。
- [ ] UDP socketはprocess所有とし、startup失敗と通常終了のどちらでも一度だけcloseされる。
- [ ] local UDPで2 sessionを作る結合テストにより、同じportのcandidate、接続成立、終了後のsocket closeを確認する。

## 設計判断

- process単位の`webrtc.API`とICE UDP muxを既存Managerへ注入し、sessionごとにlistenerを作らない。
- 設定可能にするのは実機差があるbind address、public IPv4、port、interfaceだけとする。
  TURN、IPv6、複数instance、ICE-TCPは追加しない。

## スコープ境界

- 本タスク: Go起動設定、process共有のPion network API、socket lifecycle、関連テストとREADME。
- スコープ外: Docker/compose wiring、firewall変更、production相当NATでの実測、性能比較。

## 実装方針

`internal/config`で設定を検証し、`cmd/pion-poc`でUDP socketとPion APIを所有する。現在
`internal/rtc/session.go`でsessionごとに生成している`SettingEngine`はprocess共有設定を再利用する。

## テスト

- `go test -race ./internal/config ./internal/rtc ./cmd/pion-poc`
- `go vet ./...`
- rootの`npm run gate`

実NAT、Chrome / Firefox、firewallはPhase 4リハーサルtaskだけで確認し、このタスク用のnetwork harnessは作らない。

## ドキュメント同期の要否

要。`sincromisor-server/sincro-rtc-pion-poc/README.md`の起動引数と
`documents/migration/pion/rollout-and-operations.md`の設定名を実装へ同期する。公開HTTP / DataChannel契約は変えない。
