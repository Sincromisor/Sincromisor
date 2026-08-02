# Review: task-260802032922-pion-phase-3-observability-gate-3

## 判定

APPROVED

前回の blocking High はすべて解消され、現行コード参照、process phase / drain、panic cleanup、
startup 対象、structured-log allow-list、RTCP 算定が一意な設計と検証条件へ更新された。
改訂で新たに実装を破綻させる矛盾もないため、再実装へ進めてよい。

## 指摘事項

なし。

## 実装者への申し送り

- 専用ブランチの attempt 3 実装を再利用し、`eval.md` が残課題として特定した
  `cmd/pion-poc/main.go` の process lifecycle log と、その privacy / change-comprehension
  surface の9列 audit、captured-log field allow-list testを必ず同時に直すこと。
- main checkout では `internal/signaling/http.go:37-42,81-92` の `SessionService` / `Handler`、
  `internal/rtc/manager.go:113-202` の reservation、`cmd/pion-poc/main.go:147-205` の shutdown、
  `internal/rtc/media.go:38-52` の RTCP drain が task.md の参照どおりである。既存の
  startup/shutdown hardeningを保持し、task.md が固定した residual scopeだけを接続すること。
- process phaseは単一 `State`、initial admissionの最終保証はManager `reserve`、shutdownは
  `BeginDrain`先行かつ共通5秒deadline、mutation panicは明示的`CloseSession`経由という
  ownership境界を崩さないこと。
- structured logのapplication keyは `session_id`、`reason`、`stage`、`count` の部分集合に限定し、
  process lifecycleを含むproduction logger surface全体で検査すること。payload markerはlog valueと
  Prometheus expositionの双方で非露出を確認すること。
- 公開挙動は `documents/design/contracts/frontend-rtc.md` と
  `documents/migration/pion/rollout-and-operations.md` へ同じ変更で同期し、固定20 metric、
  health phase、panic非対象、drain順序を実装と一致させること。
