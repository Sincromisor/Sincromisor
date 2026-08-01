# Review: task-260726211012-pion-phase-2-pipeline-reset-gate-2

## 判定

NEEDS_REVISION

production factory の配置と固定 API が Go の import cycle を要求し、現存 fixture では必須の TTS 成功経路も
生成できない。いずれも Gate 2 の実装・検証を成立させない blocking High である。

## 指摘事項

- [High] production `ClientSetFactory` の配置と固定 interface が Go の package 境界上実装不能である。
  `task.md:151-204` は親 package `internal/pipeline` に `ClientSet` / `ClientSetFactory` を定義し、
  `ClientSet.Activate` と各 client interface から子 packageの `client.Event` を参照する一方、
  `task.md:207-210` は concrete factory / set の実装先を
  `internal/pipeline/client/set.go` に固定している。Go では interface method の戻り値は共変ではないため、
  子 packageの `Connect` / accessor が concrete `*client.Extractor` 等を返しても
  `(ClientSet, error)` / `ExtractorClient` を返す親 interfaceを満たさない。親の named interfaceを
  戻り値にするには子 packageから親 `pipeline` をimportする必要があるが、親は既に
  `client.Event` をimportするためcycleになる。production set / factoryを親 packageへ置くか、
  interfaceとevent型の所在をcycleしない共通 packageへ移すかを1案に確定し、concrete constructor、
  dependency（resolver / logger / clock）と最小signatureまで task.md に固定する必要がある。

- [High] Gate 2の固定 processor fixtureと、必須のSynthesizer成功経路が矛盾する。
  `task.md:61-75` は `voice_text` がnon-emptyのProcessorResultだけをSynthesizerへ送り、
  final resultだけをconfirmed historyへcommitすると定め、`task.md:99-114,285-301` は
  Python生成fixtureを原本としてidentity / historyだけをpatchし、raw bytesのSynthesizer転送、
  encoded voice / mora、次の1往復まで必須にしている。しかし実在する
  `internal/pipeline/protocol/testdata/generate_fixtures.py:145-154` の唯一の
  `text_processor_result.msgpack` は `end_of_response=False` かつ `voice_text=None` である。
  許可されたpatchではnon-empty voice textにもfinal resultにもできず、仕様どおりなら
  Synthesizer requestは0件のままで必須outputへ到達しない。必要なintermediate / final
  ProcessorResultをPython production modelで生成したfixtureとして追加するのか、既存fixtureのどのfieldを
  patchしてよいのかを一意に決め、raw転送互換を迂回しない検証方法と期待request回数を明記する必要がある。

- [High] reset matrix の3 failure種別のうち `normal terminal event` と `remote close` の発生方法・期待
  `client.EventKind` が区別できない。`task.md:103-106,298-301` はproduction clientを通る
  4 service x 3種を必須にするが、現行clientはpeerのclose frameをすべて
  `EventRemoteClose` とし (`internal/pipeline/client/connection.go:217-224`)、
  明示Close / parent cancellationではeventを生成しない
  (`internal/pipeline/client/client.go:53-56`)。`normal terminal event` に対応するproduction wire操作と
  expected EventKindが未定義なので、12 caseの期待値が一意でない。例えばnormal close frame、
  abrupt transport切断、malformed MessagePackをそれぞれどのEventKindとして検証するかを固定する必要がある。

## 実装者への申し送り

- 最新確認対象は HEAD `bcac013b6fb3202a56387aca39b5d35c361fcb24`。fixture path
  `internal/pipeline/protocol/testdata/*.msgpack` は実在し、今回の指摘はその訂正後の内容に基づく。
- 実Python service、YAMNet / ASR / TTS推論品質をGate 2から外し、in-process WebSocket server、
  production client、MessagePack codec、Coordinator/resetに限定する改訂方針自体は明確であり、
  旧レビューの音声fixture / metadata問題は解消している。
- reset / generation / queue / close、ドキュメント同期、comment audit / comment acceptanceは、
  対象、schema、全件照合、FAIL条件まで受け入れ条件に含まれている。上記3点の設計とfixtureを確定した後は、
  現在の限定スコープを維持する。
