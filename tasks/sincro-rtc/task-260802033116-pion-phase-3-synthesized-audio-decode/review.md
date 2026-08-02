# Review: task-260802033116-pion-phase-3-synthesized-audio-decode

## 判定

APPROVED

前回のblocking Highだった注入経路とresource ownershipの未確定は解消された。改訂箇所は現行コードと
整合し、受け入れ条件・成果物を非一意にする新たな破綻もないため実装へ進めてよい。

## 指摘事項

なし。

## 実装者への申し送り

- `ManagerConfig -> sessionBuildRequest -> newSession -> Session` の全段で同一の
  `*synthdecode.Decoder` を渡す。`NewManager` と `newSession` はnilを各resource作成前に拒否する。
- Decoderはprocess-wide immutableな非所有参照である。`sessionResourceClosers`へ追加せず、
  一方のSessionのcleanup/Closeが他方のSessionのDecoder参照へ影響しないことを指定テストで固定する。
- `CommandRunner.Run` はtask.md記載の具体型
  （`context.Context`、`string`、`[]byte`、`int64`、`...string`、`[]byte`、`int`、`error`）に揃え、
  fakeと実runnerで同じ契約を検証する。
- 現行コード参照は `internal/rtc/manager.go:24,34,89`、
  `internal/rtc/session.go:33,59,73`、DTO・channel・設計文書の指定行と一致している。
  実装による行移動後は、実装ログで最終的なsymbolを追跡する。
- README同期と、task.mdのschemaに従うcomment audit / comment acceptanceを完了条件として維持する。
