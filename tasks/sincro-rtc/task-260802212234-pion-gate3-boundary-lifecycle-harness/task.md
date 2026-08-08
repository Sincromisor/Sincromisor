# Pion Gate 3境界クライアントと終了系ハーネスを実装する

## 中止理由

接続準備失敗、SIGTERM、process restartは既存のrepository testで確認できる。
Gate 3専用のWebRTC clientと同等のresource collectorを追加しても切替判断は変わらないため、本タスクは中止する。

代表的な異常終了の確認は
`task-260802033044-pion-phase-3-production-candidate-gate-3`で既存testを直接実行する。

## 未実装

- `internal/gate3/boundaryclient`
- 無応答STUN listener
- Gate専用のprocess restart scenario

これらは実運用で既存testでは再現できない障害が観測された場合だけ、原因に限定した独立taskとして起票する。
