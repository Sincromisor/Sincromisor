# 評価: task-260817014711-pion-compose-dynamic-media-bind

## 判定

PASS

## 根拠

- commit `c147b576b533e88b4c82269ef598ba0ba7dca4d0` は `SINCRO_PION_CONTAINER_IPV4` と Pion 専用 `ipv4_address` を除去した。`.env` と `examples/compose.env` に同変数はなく、`docker compose --profile pion --env-file examples/compose.env config` でも Pion の shared network は動的 endpoint のみである。
- `--media-udp-port` と `--interface` から唯一の非-unspecified IPv4 を選択して UDP4 socket を bind する。0 / 範囲外 port、missing / down interface、0 / 複数 IPv4 は listener 前に拒否し、`TestSelectMediaIPv4` と config 境界テストがそれを網羅する。旧 `--media-udp` は production wiring、README、設計・運用文書から除去済みである。
- public candidate、host/container UDP mapping、container 内 bind address の環境変数責務は分離されたままであり、`sincro-consul-server` は `pion` profile に含まれ、Pion は `condition: service_healthy` に依存する。変更対象の公開運用文書も同期している。
- `npm run gate` は再実行で FAIL したが、原因は変更前から存在し、差分に含まれない3件の task Markdown の Prettier 違反のみである。この既知の非対象 baseline failure は本タスクの受入条件・実装品質の PASS 判断を妨げない。ただし repository 全体の Gate は未通過のままであり、完了処理時には別途解消またはプロジェクト方針に従った扱いが必要である。
- 先行評価で失敗した統合試験は、host の `lo` が複数 IPv4 を持ち、新しい fail-fast 契約により listener 前に終了したことが直接原因だった。追加commit `09ab2b1` は稼働中かつ唯一 IPv4 の non-loopback interface を選ぶだけの最小修正である。独立再実行では対象統合テスト2件、`go vet ./...`、`go test ./...`、`gofmt -l .` がすべて PASS した。

## 残課題

- `tasks/bug/task-260810024443-pion-recognizer-input-accumulation/task.md`、`tasks/bug/task-260810024443-pion-synth-decode-error-classification/task.md`、`tasks/bug/task-260810031743-pion-voice-synthesizer-decode-invalid/task.md` の既存 Prettier 違反により、全体 Gate は FAIL のままである。
