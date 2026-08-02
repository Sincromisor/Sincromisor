# レビュー: task-260802212216-pion-gate3-pipeline-contract-harness

## 判定
NEEDS_REVISION

前回の障害規則、backoff、session、metric、error、コメント条件の指摘は解消された。ただし、子process所有者の生成APIを確定する直接依存が未実装であり、`consuldev.Agent` の構築・所有権を現行コードで裏取りできないため実装へ進めない。

## 指摘事項
- [重大] 直接依存 `task-260802212212-pion-gate3-harness-foundation` は task.md が APPROVED になっただけで `status: open`、`internal/gate3/process` は未実装である。依存taskは `process.Command` のschemaと `Owner` の `Start` / `Signal` / `Wait` / `Close` 契約を固定している（同task.md:43-53）が、`Owner` のconstructor、返却型、依存注入方法は実コードとしてまだ確定していない。本taskは `consuldev.Start(Config{Binary, Services})` が内部の `process.Owner` を単独所有すると決めているため（task.md:49-57）、依存実装で選ばれる生成APIによってconstructorと所有権接続が変わる。依存taskを実装・評価・完了した後、実在する `process.Owner` の生成APIを `file:line` で参照し、`consuldev.Start` が渡す `process.Command`、`Start` 失敗時のcleanup、`Agent.Close(context.Context)` と `Owner.Close()` の責務分界をtask.mdに固定して再レビューする必要がある。

## 実装者への申し送り
- `delay` は `held-close` へ置き換えられ、各規則が次のupgradeを1回拒否するため、reset後に接続失敗を起こしてbackoffへ入る経路は一意になった。
- RTC sessionという不整合な表現はpipeline session IDへ修正され、metricも障害発生元serviceの `start` / `success` 各1増加へ固定された。
- 新規package API、有限error分類、コメント点検・評価条件は、前回指摘を解消する粒度まで具体化された。
