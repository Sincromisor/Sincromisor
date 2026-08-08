# レビュー: task-260809020144-pion-phase-4-production-network

## 判定

NEEDS_REVISION

この判定後、task.mdでgather timeout、UDP mux/socketの所有権と終了順序、bind/interface検証、失敗時の
再検証手順を明文化した。改訂後の実装着手前に、必要なら改訂内容を再レビューする。

## 理由・申し送り

- process共有 `webrtc.API` は、現行 `internal/rtc/session.go` の `newPeerConnection` が Offer ごとの gather deadline を `SettingEngine.SetSTUNGatherTimeout` へ渡す契約と両立しない。`--gather-timeout` を process 固定値として共有APIへ移すのか、HTTP owner deadline をどこまで Pion gather に反映するのか、timeout時の session/mux の状態を受け入れ条件とテストで一意に定める必要がある。
- `ice.UDPMuxDefault.Close()` は渡された `net.PacketConn` も close する。socketを直接closeする経路との二重closeを避けるため、mux と socket の唯一の close owner、通常shutdown・HTTP listener起動前失敗・session close timeout時の順序（session収束待ち、mux close、HTTP停止）を定め、close回数を観測するテスト境界を明記する必要がある。
- bind address と interface の組合せが未定義である。wildcard bindを許可するか、bind IPv4が指定interfaceに割り当て済みであることを必須にするかを決めないと、存在するinterfaceを指定してもcandidateが0件になる設定を受理できる。IPv4のみ、固定port（0不可）、interfaceの状態・所属IPv4、public IPv4との検証関係を起動前拒否条件として定める必要がある。
- 必須commandまたは結合試験が失敗した場合に、証拠採取、原因特定、修正・再検証、または原因を特定した後続taskへの明示的な移管を完了条件へ追加する必要がある。失敗を `impl.md` 等へ記録するだけでは完了にしないことも明記する。
- 実装時のコメント点検は規約を複製せず、`documents/rules/source-comments.md` を直接参照すること。特に process owner、mux/socket所有権、timeout後の処理継続をコード近傍で説明する。
