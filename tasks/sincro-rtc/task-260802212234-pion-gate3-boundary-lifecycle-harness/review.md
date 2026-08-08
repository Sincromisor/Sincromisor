# レビュー: task-260802212234-pion-gate3-boundary-lifecycle-harness

## 判定

NEEDS_REVISION

前回指摘した失敗応答時の台帳所有権と candidate overflow 契約は解消した。一方、今回追加された直接依存が
本タスクの所有権と本番環境向けテスト接続点を確定する未完タスクであり、現行 HEAD では実装に着手できない。

## 指摘事項

- [重大] `meta.yaml:5-8` で直接依存に追加した
  `task-260802212216-pion-gate3-pipeline-contract-harness` は、同タスクの `meta.yaml:4,10` では
  `status: open`、`verdict: null` の未完状態である。現行 HEAD にも同依存が提供する
  `internal/gate3/pipelinecontract`、`internal/gate3/wsproxy`、`internal/gate3/consuldev` は存在しない。
  本タスクは `task.md:61,97-102,132-135` で、100 session が共有する4下流接続の所有・観測、
  `Set` / proxy / Consul の終了順序、本番 Pion process の接続先をこれらの実装へ直接委ねている。
  したがって依存実装は単なる補助ではなく、リソース所有権と本番環境向けテスト接続点を確定する。
  `tasks/AUTHORING-CHECKLIST.md:68-70` に従い、依存タスクが PASS して現行 HEAD に実装された後、
  確定した constructor、台帳、同時100接続、終了契約と本タスクの前提を再照合するまで
  APPROVED にできない。

## 実装者への申し送り

- `Client` が生成時から byte 台帳を所有し、HTTP 非2xxで `Session` が nil でも
  `Client.Ledger()` から read-only snapshot を取得できる契約に改訂されたため、前回の重大指摘は解消した。
- candidate queue は generation ごとに最大64件、65件目で全破棄・POST 0件・resource close・worker join、
  併発 error は `errors.Join` と固定されたため、前回の中指摘も解消した。
- 依存タスク完了後の再レビューではフル再走査せず、実装済み
  `pipelinecontract` / `wsproxy` / `consuldev` の constructor、accepted / active / closed 台帳、
  100同時接続の可否、cleanup順序と `task.md:97-102,132-135` の整合だけを重点確認すること。
