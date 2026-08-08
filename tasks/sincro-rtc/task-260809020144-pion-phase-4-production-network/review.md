# レビュー: task-260809020144-pion-phase-4-production-network

## 判定

APPROVED

## 理由・申し送り

- 依存する Phase 3 Gate は `status: done`・`verdict: PASS` であり、roadmap の Phase 4 着手条件とも一致する。
- 現行の `internal/rtc/session.go` は session ごとに `SettingEngine` / `webrtc.API` を生成し、Offer context の deadline を gather timeout へ渡している。本タスクはこれを process 共有 API の固定 `--gather-timeout` と HTTP request deadline に分離すると明示しており、共有 UDP mux への移行範囲と timeout 後の所有権が一意である。
- bind IPv4・interface・port・advertised IPv4・STUN URL の起動前検証、UDP4 / interface allow-list、TURN・IPv6・ICE-TCP 非有効化が明示されている。public 到達性を検査対象外とし、loopback を local 結合試験で許可する境界も明確である。
- mux/socket の唯一の close owner、起動途中失敗、通常 shutdown、session close timeout の扱いと、2 session の candidate・接続・socket close を確認する結合試験が指定されている。必須確認失敗時も、証拠採取から原因特定・修正・再検証または明示的移管まで定義され、記録だけで完了できない。
- README と rollout-and-operations の同期先、対象を絞った Go test・vet・root gate が示され、HTTP / DataChannel 公開契約は変更しない。実装時のコメント規約は `documents/rules/source-comments.md` を直接参照し、API・mux/socket所有権・shutdown順序・timeout境界を確認すること。
