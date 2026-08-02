# レビュー: task-260802182106-pion-gate-3-production-validation-harness

## 判定

NEEDS_REVISION

前回の境界 client に関する重大指摘は解消したが、現行 Frontend の ICE restart と本番プロセスの
draining を必須ライブケースとして決定的に発火・観測する方法が、許可された境界内では確定していない。

## 指摘事項

- [重大] 現行 Frontend で ICE restart を開始させる障害注入方法が未定義であり、
  `G3-FUNC-001`、`G3-READY-001/restart-deadline`、`HarnessContract`を再現可能に実行できない。
  task.md:24-26,152,237,299,316-321 は現行 Frontend で同一 session の restart を必須にする一方、
  task.md:113-118 の reverse proxy は HTTP の`offer` / `candidate`だけを注入対象とし、
  task.md:32-33,117 は Frontend の global hook と本番接続点を禁止している。現行実装は
  `sincromisor-frontend/src/features/rtc/rtcTalkClient.ts:248-282`のとおり、
  `iceConnectionState`が`disconnected`のまま10秒経過するか`failed`になった場合にだけ update Offer を開始する。
  task.md:299 の「update Offer応答を保留」は開始後の失敗注入であり、その update Offer 自体を発生させない。
  WebRTCメディア経路だけを遮断してHTTP経路を維持する方法、必要権限、対象portの特定、解除・収束までを
  固定するか、現行 Frontend の証拠に数えない別の検証層へ期待値を変更する必要がある。
- [重大] `G3-OPS-001`の「draining観測後に新規initialを送り503を得る」手順は、
  本番子プロセスの現行shutdown順序では決定的に実行できない。task.md:167,301 はSIGTERM後に
  drainingを観測してから新規requestを送るが、`cmd/pion-poc/main.go:196-208`はSIGTERM受信後、
  `BeginDrain()`直後にprocess contextをcancelし、同じlistenerへ`http.Server.Shutdown`を開始する。
  drainingを返す`/statuses`もinitial Offerもこのlistener上にあるため、観測後の新規requestは
  503ではなく接続拒否との競争になる。本番コード変更をtask.md:252-254で禁止する以上、
  signal前からdispatch済みのrequestをどの境界で保持し、何をもってdraining観測とするかなど、
  現行listener lifecycleで再現可能な手順と観測順を一意に固定する必要がある。
- [中] 外部入力では暗黙の`PATH`探索を禁止し`SINCRO_GATE3_GO_BINARY`を必須にしている
  （task.md:70-72,99）が、子プロセス用本番実行ファイルの固定buildは
  `go build ...`と記載され（task.md:48-52）、同環境変数の適用が明記されているのは既存試験証拠の
  子コマンドだけである（task.md:173-175）。buildにも検証済み絶対pathを使うことを明記し、
  固定コマンド表示と実際のargvが矛盾しないようにすること。
- [中] 前回指摘した英語偏重は一部改善されたが、説明文と表に`client`、`proxy`、`sample`、
  `browser event`、`turn transcript`、`status`、`cache`、`current working directory`など、
  識別子や規格名ではなく一般的な日本語へ置換できる語が多数残る。task.md全体を
  `tasks/AUTHORING-CHECKLIST.md:137-141`と`tasks/README.md`の言語規則に沿って整理すること。

## 実装者への申し送り

- 前回の重大指摘だった音声RTP未送信・必須DataChannel欠落の生成方法は、
  `internal/gate3/boundaryclient/`、適用範囲、禁止事項、本番Pion adapter後の観測点まで
  task.md:27-33,120-124,286-301,358-364で固定され、解消している。
- 前回のMarkdown表の破綻は、既存試験証拠のコマンドをシナリオ別コードブロックへ分離し、
  注入語彙の`|`を通常の区切りに変更したことで解消している。
- 外部入力、成果物schema、標準シナリオ台帳、ライブ／境界 client／既存試験証拠の分界、
  `FAIL > NOT_OBSERVED > PASS`の集約規則、リソース基準値と収束条件は具体化されている。
- 列挙されたGoの既存試験名とFrontendのrollback試験ファイルは現行コードに存在する。
  依存タスク`task-260802032922-pion-phase-3-observability-gate-3`も完了済みである。
- 本番コードを変更しない境界、9列の全件コメント点検、弱い・古いコメントとTODOの扱い、
  `internal/gate3/README.md`および`documents/migration/pion/validation-plan.md`の文書同期条件は
  現行規約を満たしている。
