# 実装記録: task-260802212216-pion-gate3-pipeline-contract-harness

## 完了時の要約

-

## 不合格分類

none

## 検証結果

-

## 未実行の確認

-

## attempt 1

### 判断・レビュー申し送りへの対応

- 実装の正本は commit `6abe0cd4444eea269b6f472628893af1d2b9c0a1`。契約 service、有限障害 proxy、
  専用 Consul 所有者、metric service 変換、自己検証、文書同期を同一 commit に含めた。
- 履歴確定タイミングは12 caseの台帳で照合した。障害 attempt の service prefix だけを残し、
  復旧 Processor request / final history は Extractor・Recognizer=`3/4`、Processor=`4/5`、
  Synthesizer=`5/6`を要求した。Processor final 未到達時の assistant は生成していない。
- Consul error は操作別 sentinel とし、部分登録と rollback failure の併発試験で
  `ErrRegistration` と `ErrCleanup` の両方に `errors.Is` が成立するよう `errors.Join` した。
  `Close` は期限切れ context でも逆順 deregister を全件試行後、context を取らない
  `process.Owner.Close()` を必ず呼ぶ。
- 接続数は production の Extractor → Recognizer → Processor → Synthesizer 順に対応する差分行列を
  12 caseで照合した。503拒否は accepted / closed に含めず、部分 set cleanup と再試行後 active=1、
  scenario cleanup 後 active=0を分けて確認した。
- `close` でも request を upstream へ渡して response 配信前に閉じるため、契約 service の障害 prefix は
  台帳へ残る。`held-close` は有効 response を読み取って破棄し、旧 generation output は
  generation=2 の output assertion に混入しないことを確認した。

### 逸脱・詰まり・残リスク

- 仕様からの設計逸脱はない。
- 開始時確認で Go 1.26.5、MessagePack固定データ6件、Frontend依存 symlinkを確認した。
  default sandbox は loopback bind と通常 Go cacheへのwriteを拒否したため、network testは承認済みの
  権限付き実行へ切り替え、`GOCACHE=/tmp/gate3-contract-gocache` と既存の読み書き可能な
  `GOMODCACHE=/tmp/sincromisor-attempt4-gomodcache`を使った。実装不良とは分離した。
- host の `127.0.0.1:8500` は既存 Docker Consul が使用中で、Consul binaryも PATH/既知配置に無かった。
  既存 Consulを変更せず `ErrPortInUse` を返す境界は実測した。専用 Agent の成功、登録、逆順解除、
  部分登録 rollback、期限切れ Close は current test executable を継承環境なし child として使う
  fake Consul試験を追加したが、この環境では port占有を検出して成功系はskipされた。
  cleanな8500番 portを持つ評価環境で同じ試験が実行される。実 Consulによる手動実測だけが残リスク。

### 検証結果

- `go test -race -tags=gate3 ./internal/gate3/pipelinecontract ./internal/gate3/wsproxy ./internal/gate3/consuldev`
  : PASS。4 service × 3 faultの12 case、直接契約、有限規則負試験、Consul error分類を含む。
- `go test -race ./internal/pipeline/...`: PASS。
- `go vet -tags=gate3 ./...`: PASS。
- `go test ./...`: PASS。
- `npm run tasks:check`: PASS（280 task）。
- `npm run commit:check`: PASS。
- root `npm run gate`: commit `6abe0cd`の lint / build / test が全てPASS。再実行で3 stepの
  commit SHA cache hitも確認した。
- `gofmt -l` と `git diff --check`: 出力なし。

### ドキュメント同期

- `internal/gate3/README.md`へ4契約 service、MessagePack台帳、障害語彙、arm/消費条件、専用Consul、
  contract doubleを実 serviceのGate合格証拠にしない境界を同期した。
- 公開 metric契約、service契約、metric名、label集合は変更していない。
  `documents/migration/pion/rollout-and-operations.md`の既存
  `extractor|recognizer|processor|synthesizer`を実装側へ合わせたため、同文書の変更は不要。
- 生成物・公開 barrelへの影響はなく、再生成対象はない。

### コメント点検（規約9列）

| パス                                                                    | シンボル・処理群・判断                                        | 種類                              | 現在のコメント                                                           | 読者の疑問                                                                 | 読者に必要な知識                                                                                                      | 判断           | 対応または省略理由                                                                                             | レビュー担当者メモ                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `internal/gate3/pipelinecontract/doc.go`, `types.go`                    | package境界、Config、Entry、Transcript、sentinel              | 案内・API・データ・失敗           | 新規のため無し                                                           | 実Python serviceとの違い、台帳にpayloadを持たない理由、各fieldの意味は何か | fixtureを正本にする自己検証doubleでありGate合格証拠ではないこと、ID・履歴fieldの単位                                  | 追加           | package comment、全exported type/error/fieldへ目的、入力、観測値、非対象を追加                                 | 実service合格を主張せずpayload-free台帳になっているか            |
| `internal/gate3/pipelinecontract/fixtures.go`                           | fixture load、再帰schema/type family検査、optional scalar     | MessagePack境界・データ変換       | 新規のため無し                                                           | 動的値を許しつつ何を固定するか、Python optionalをどう扱うか                | key集合とbinary/string/map/list境界を固定し、ID・履歴値だけ変化可能であること                                         | 追加           | `validateShape`へfixtureとの互換境界とoptional scalarの理由を説明                                              | extra key、型違い、trailing objectが拒否されるか                 |
| `internal/gate3/pipelinecontract/server.go`                             | Extractor初期化、PCM attempt、ID採番                          | 処理の流れ・状態・identity        | 新規のため無し                                                           | responseを送れなかったattemptをなぜ台帳へ残すか                            | fixture基準S/Qへattemptを加え、held responseも障害prefixになる順序                                                    | 追加           | handler直前へprelude→採番→台帳→responseの流れを追加                                                            | S/Q、S+1/Q+1、S+2/Q+2が成立するか                                |
| 同上                                                                    | Recognizer→Processor→Synthesizer handler群                    | 処理の流れ・MessagePack境界       | 新規のため無し                                                           | service間identity、履歴、Raw bytesをどこで照合するか                       | 各handlerが前段台帳を検査し、Processor bytesを再encodeせず後段で一致確認すること                                      | 追加           | 各処理群へ前後関係、検査対象、保存bytesの所有者を追加                                                          | 順序違反、ID不一致、byte不一致が有限errorになるか                |
| `internal/gate3/pipelinecontract/ledger.go`, `set.go`                   | stage/identity台帳、Verify、listener/handler lifecycle        | 状態遷移・生存期間・制約          | 新規のため無し                                                           | どのscenario形だけを完了とするか、hijacked WebSocketを誰がjoinするか       | 1正常turnまたは正常/障害prefix/復旧の3 attemptだけを許し、Closeが新規Addを止めてhandlerをjoinすること                 | 追加           | `expectIdentity`、Verify、`beginHandler`、Set/New/Closeへ状態と終了順を説明                                    | 余分なframe、未完了stage、Add/Wait race、冪等Closeを照合         |
| `internal/gate3/wsproxy/doc.go`, `types.go`                             | package境界、Action、Rule、Config、Counts、Ledger、sentinel   | 案内・API・データ・失敗           | 新規のため無し                                                           | fault方向、503の計数、任意predicateを持たない理由は何か                    | server→clientの固定3語彙、ordinal/reject各1、503はaccepted/closed外                                                   | 追加           | package commentと全exported type/error/const/fieldへ有限契約と観測値を追加                                     | label/規則語彙がタスク外へ拡張されていないか                     |
| `internal/gate3/wsproxy/proxy.go`                                       | Extractor preface、双方向転送、close/malformed/held-close     | 処理の流れ・状態遷移              | 新規のため無し                                                           | Extractor初期化がなぜruleを消費しないか、各faultがresponseをどう扱うか     | reconnect初期化後も最初のPCM交換を対象に保ち、closeはupstream request後、held-closeはvalid response破棄後に閉じること | 追加           | prefaceと`beginExchange`へpipeline内の位置、消費順、他service透過を説明                                        | faultごとのservice prefixと次upgrade拒否が1回か                  |
| `internal/gate3/wsproxy/set.go`                                         | Arm、VerifyConsumed、connection counter、Close                | 有限規則・生存期間・制約          | 新規のため無し                                                           | arm可能時点、競合時の非破壊性、handler join順は何か                        | 全4 service正常交換済み・in-flightなし・既存規則なしだけarmし、Closeはcancel→listener→handler joinすること            | 追加           | public APIと`beginHandler`へ前提、失敗、副作用、終了順を追加                                                   | 空列、未完了正常turn、未消費規則、request中ArmがErrArmConflictか |
| `internal/gate3/consuldev/doc.go`, `types.go`                           | package境界、Config、固定ID、sentinel                         | 案内・API・設定・失敗             | 新規のため無し                                                           | 既存Consulを変更する可能性、登録の所有範囲、分類可能errorは何か            | 8500専有を起動前確認し、固定4 IDとprocessだけを所有すること                                                           | 追加           | package commentと全exported error/const/type/fieldへ所有範囲と入力制約を追加                                   | service過不足・host/port不正がErrProtocolか                      |
| `internal/gate3/consuldev/agent.go`                                     | Start、bind probe、process.New/Start、登録順                  | process境界・生存期間・処理の流れ | 新規のため無し                                                           | Start失敗時にOwner.Closeする条件、なぜEnv空か、登録順は何か                | Owner.Start失敗前は非所有、成功後は全失敗経路でcleanup、継承なしCommand、pipeline順登録                               | 追加           | Agent/Startと近接処理へ起動前後の所有権、入力、失敗、順序を追加                                                | Owner.Start失敗でCloseせずErrProcessだけか                       |
| 同上                                                                    | readiness probe、register DTO                                 | retry・HTTP境界・データ           | 新規のため無し                                                           | 一時接続拒否とprocess終了をどう分類し、Consulへ何を送るか                  | 5秒内leader probe、process終了優先、DTOはID/Name/Address/Portのみ                                                     | 追加           | `waitReady`と`register`へretry理由、分類優先、非対象health checkを追加                                         | 非2xx/不正leader/timeoutと登録非2xxのsentinelを照合              |
| 同上                                                                    | rollback、Agent.Close、deregister、Owner.Close                | cleanup・生存期間・失敗集約       | 新規のため無し                                                           | ctx失効や複数失敗時もprocessが残らないか                                   | 逆順全件解除を試み、結果に関係なくcontextなしOwner.Closeでwaiterをjoinすること                                        | 追加           | Close/`cleanup`へ終了順と`errors.Join`の観測契約を追加                                                         | 元sentinelとErrCleanupの両方がerrors.Is可能か                    |
| `internal/observability/registry.go`                                    | PipelineReconnect、normalizePipelineService、services固定集合 | 公開metric境界・代替処理          | 既存英語commentは短縮label入力だけを前提としておりproduction値変換が不足 | productionの4 service名がどの公開labelになり、未知値はどうなるか           | 4値の一意変換、短縮label互換、未知値extractor fallback、固定集合維持                                                  | 書き直し・追加 | PipelineReconnect commentを書き直し、直接helperへ変換表の意図とcardinality制約を追加。固定`services`集合は維持 | 4値+未知値の回帰試験と公開label集合を照合                        |
| `internal/gate3/*/*_test.go`, `internal/observability/registry_test.go` | 直接契約、12case、負試験、fake Consul、metric回帰             | テスト                            | 対象外                                                                   | 本番変更のreader向けcomment対象か                                          | test名とfixture helperで証明対象が局所的に読め、本番API/lifecycleではない                                             | 維持           | テスト・固定データのみのため本番コメント点検対象外。複雑なfake process入口には処理構造をテストコードで分離     | 各試験がどの受け入れ条件を証明するかを名前とassertionで確認      |
| `internal/gate3/README.md`                                              | 下流契約harness説明                                           | 文書                              | 既存文書に本タスク範囲無し                                               | harnessの自己検証範囲と実service証拠の境界は何か                           | 4契約、fault語彙、arm/消費、専用Consul、非合格証拠                                                                    | 追加           | task指定の同期先へ日本語で追加。source comment監査対象外                                                       | 実装API・語彙・所有順と同期しているか                            |

古いコメントは `Registry.PipelineReconnect` のみ該当し、production service変換を説明する内容へ書き直した。
削除対象、コメントアウトcode、TODOは無い。file/module commentへの一括集約だけで済ませず、各公開API、
MessagePack境界、handler処理群、有限状態、process cleanupへ近接コメントを配置した。

## attempt 2

### 判断・評価残課題への対応

- 追加実装の正本は commit `ab3d7b2303002afc952d0126190c9787f4ea4ddc`。attempt 1への独立評価で
  `coverage_gap`とされた所有者間結合証拠と負試験を、同一branchへの追加commitで補完した。
- 実際にlistenしている4 proxyのendpointを公開`consuldev.Start`経由で登録し、同一試験内で
  production `discovery.Resolver`と`pipeline.Coordinator`を接続した。各health応答の固定ID・Name・
  proxy address/port・1件性、4件以外の登録なし、proxy accepted/active/closed、panic callback 0を
  同じ所有関係の観測値として照合した。
- `127.0.0.1:8500`が既存Consulに占有された環境でも全Consul経路をskipしないため、外部packageから
  設定不能なpackage内試験optionを設けた。公開`Start`の`127.0.0.1:8500`、5秒readiness、
  500ms HTTP timeout契約は固定したまま、試験だけが別loopback portと短い期限を使う。
- 公開WebSocket endpointへ直接不正入力を送る試験を追加し、余分なPCM frameと
  Recognizerを飛ばす順序違反を`ErrProtocol`、Extractorと異なる`speech_id`を`ErrIdentity`として
  `Verify`から観測した。台帳のidentity不一致とstage不一致を別sentinelへ分類するよう整理した。
- 12 caseの全`held-close`でCoordinator終了後にも旧generationの結果channelが空のまま閉じ、
  scenario終了まで旧出力が現れないことを明示検査した。復旧3出力のgeneration=2検査も維持した。
- Configのservice過不足・host/port不正、Owner.Start失敗、readiness前process終了、readinessの
  非2xx・不正leader・timeout、登録失敗rollback、単独cleanup失敗、期限切れClose、元失敗と
  cleanup失敗の併発を能動的に発生させ、操作表の全sentinelと`errors.Is`併存を網羅した。

### 逸脱・詰まり・残リスク

- 承認済みの公開契約、所有権、状態機械、失敗時成果物からの逸脱はない。
- sandbox内のタグなし全testはloopback bind禁止で失敗した。権限付きで同一コマンドを再実行して
  全package PASSを確認し、実装不良と環境制約を分離した。
- hostの8500番は引き続き既存Docker Consulが占有し、`consul` binaryも無い。8500競合時にprocessを
  起動せず既存Consulを変更しないproduction境界を実測し、それ以外は継承環境なしの実child processと
  HTTP互換fakeでprocess lifecycle、readiness、登録、解除を検査した。実Consul binaryそのものの挙動は
  後続Gate実測が所有する残リスクであり、本タスクのcontract harness境界は全件実行されskipは無い。

### 検証結果

- `go test -race -tags=gate3 ./internal/gate3/pipelinecontract ./internal/gate3/wsproxy
./internal/gate3/consuldev -count=1 -v`: PASS、SKIPなし。直接契約、12 fault case、公開wire負試験、
  Consul全sentinel、実proxy＋Consul所有者間結合を含む。
- `go test -race ./internal/pipeline/... -count=1`: PASS（4 package）。
- `go vet -tags=gate3 ./...`: PASS。
- `go test ./...`: PASS。
- `npm run tasks:check`: PASS（280 task）。
- `npm run commit:check`: PASS。
- root `npm run gate`: commit `ab3d7b2`のlint / build / testが全てPASS。再実行で3 stepの
  commit SHA cache hitも確認した。
- `gofmt -l`と`git diff --check`: 出力なし。

### ドキュメント同期

- 公開API、通信契約、公開挙動、metric名・label集合は変更していない。attempt 1で同期した
  `internal/gate3/README.md`の4契約service、障害語彙、専用Consul、自己検証境界は追加試験後も正しく、
  本attemptで本文変更は不要と判断した。
- `startOptions`と`Config.testOptions`はpackage外から参照・設定不能な試験seamであり、
  productionの固定address / timeout契約や利用例を変更しない。生成物・公開barrelへの影響もない。

### コメント点検（規約9列）

| パス                                                                              | シンボル・処理群・判断                                               | 種類                              | 現在のコメント                                                                  | 読者の疑問                                               | 読者に必要な知識                                                                                            | 判断           | 対応または省略理由                                                                                                                                                      | レビュー担当者メモ                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `internal/gate3/consuldev/agent.go`, `types.go`                                   | `Start`、`startOptions`、`start`、`Config.testOptions`、base URL伝播 | process境界・試験seam・処理の流れ | 公開Startの固定値とprocess所有順はattempt 1で説明済み。試験seamの境界説明は無し | 別portと短い期限がproduction契約を変えないか、なぜ必要か | 公開Startは固定値を選び、外部から設定不能なoptionは既存8500番Consulを変更せず全失敗経路を試すためだけに使う | 追加・維持     | `start`へproduction固定値から所有処理への流れ、`testOptions`へpackage内限定と公開契約非影響を追加。既存Start/readiness/register/cleanupコメントは実装と一致するため維持 | 外部packageがoptionを注入できず、productionの8500番・5秒契約が固定か |
| `internal/gate3/pipelinecontract/ledger.go`, `server.go`                          | `validateIdentity`と3 downstream handlerのerror分類                  | MessagePack境界・台帳・失敗分類   | `expectIdentity`はstageとidentityを一括boolean判定すると説明                    | wire上のID不一致と順序違反をどう区別して観測するか       | session/speech/sequence不一致は`ErrIdentity`、既知sequenceのstage不一致は`ErrProtocol`として台帳へ記録する  | 書き直し・維持 | helper名とコメントを`validateIdentity`へ書き直し、handlerをfield不足・history不正・stage/identityで分類。既存の前後段・byte同一性コメントは維持                         | 公開wire負試験から`Verify`の所定sentinelが`errors.Is`可能か          |
| `internal/gate3/consuldev/*_test.go`, `internal/gate3/pipelinecontract/*_test.go` | fake Consul、所有者間結合、wire負試験、held-close旧出力検査          | テスト                            | 本番コメント点検対象外                                                          | 追加した試験helperへ本番同等のdoc commentが必要か        | test名、局所helper名、event assertionが証明対象を表し、公開APIやproduction lifecycleを追加しない            | 対象外         | テスト・固定応答・試験child processのみのため本番コメント点検対象外。複雑なfakeはscript生成、event取得、option作成をhelperへ分割した                                    | SKIPなしで各評価残課題を能動的に壊しているか                         |

古いコメント、コメントアウトcode、TODO、削除対象は無い。変更理解範囲はConsulの起動option選択から
readiness・登録・cleanupまでと、契約serviceのidentity/stage照合から各handlerの記録までを確認した。
