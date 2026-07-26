# Implementation Log: task-260726151514-aiortc-baseline-gate-0

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断と申し送りへの対応

- scenario終端とinitial connectionを別fieldで保持し、集計でも `scenario.result` と
  `connection.initialReady` を別々に数える設計にした。close / reconnect失敗を接続成功へ二重計上しない。
- markerのCRC-4 polynomial `0x3`、init `0x0`、MSB-first、FSK 0=`700 Hz` / 1=`1300 Hz`、
  16-bit big-endian ID後のlow nibble配置を `marker-spec.json` の単一定義にした。Python generator、
  browser generator / AudioWorklet detector、fixtureがこの定義を使い、CRC不一致時にIDを推測しない。
- ChromeはhostのGoogle Chrome stableを検出し、binary versionとSHA-256を記録した。Chromium fallbackは
  実装していない。Playwright Firefox欠損はpreflight FAILとして記録した。
- validation専用coturn / stubは `scripts/validation/rtc-baseline/compose.yml` に閉じ、
  root `compose.yml`、`compose/`、production service wiringは変更していない。
- browser/network実測をoffline集計から分離した。preflightにFAILがあればbrowser測定を拒否し、
  欠測を0で補完せずGate 0 FAILへ反映する。

### 実測とGate 0

- 実行コマンド:
  `runner.py plan`、`runner.py preflight`、空のprivate raw directoryに対する `runner.py aggregate`。
- 実行環境: Darwin / arm64、Python 3.12.12、Google Chrome stable 150.0.7871.184。
- aiortcは宣言 `>=1.13.0`、lock `1.14.0`、runtime `1.14.0` を別fieldで確認した。
- Chrome binary SHA-256は
  `e723df88c82fbecb397a2d05fa16088a2e0d90ac268c786fd4a4b6eb6265b3fd`。
- Linux `tc netem`、Docker、Playwright Firefoxがないためpreflight FAIL。必須22 scenarioの実行数は
  すべて0で、connection / resource / 30分soak / audio latencyは欠測とした。Gate 0判定は `FAIL`。
- private診断原本は実装worktreeの
  `work/private-artifacts/task-260726151514-aiortc-baseline-gate-0/preflight.json` に置いた。
  raw audio、packet capture、profile、traceは生成していない。公開artifactにはprivate原本のSHA-256だけを置いた。
- 現行aiortcの機能・性能不具合はsession未実行のため抽出不能。環境blockerとbackend不具合を混同せず、
  machine-readable `knownIssues` は `measurement_blocker` に分類した。

### 詰まりと回避

- 初回 `uv lock` は既存ReazonSpeech Git依存のnetwork取得失敗、`uv lock --offline` はPlaywright wheelの
  cache欠損で失敗した。手書きlock編集はせず、親orchestratorが限定権限で `uv lock` を実行し、
  Playwright 1.55.0を含むlockを同期した。
- 初回root gateは承認済みGate 0 taskと別のGate 1 taskのPrettier driftで停止した。
  task本文は変更せず、基点ブランチの文言不変整形commit `fe418f0b` をrebaseして再実行しPASSした。

### Comment audit

production codeは変更しておらず、production comment auditは対象外である。理由は変更がvalidation script、
test、fixture、validation compose、task artifact、dependency metadataに限定されるため。

validation scriptについては公開functionと測定上のdecision / flowを次のように確認した。

| 対象                | kind / reader question                       | 判断とaction                                                                               |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| manifest parser     | schema boundary / 何をrejectするか           | `add`: moduleとpublic parserへ、未知version、欠落、負値、非有限値、重複IDの失敗契約を記載  |
| aggregate           | data / 成功母集団と欠測の扱い                | `add`: nearest-rank、initialReadyとの分離、RSSを収束判定に使わない理由を記載               |
| marker              | protocol / CRC・bit配置・PCM単位             | `add`: shared specとの関係、MSB-first、PCM formatと320 ms構成を記載                        |
| browser runner/page | orchestration / clock同期とbrowser ownership | `add`: 20 ping最小RTT、Chrome非fallback、context close、public RTC契約だけを使うflowを記載 |
| process probe       | process boundary / 0と欠測の違い             | `add`: process消滅のみ0、観測失敗はnot_available、CPU time / wall timeの式を記載           |
| validation stub     | WebSocket boundary / payloadをどう扱うか     | `add`: binary frame限定、順序・bytes不変、resource ownerを記載                             |

stale comment、根拠なしTODO、コメントアウトしたコードは追加していない。

### ドキュメント同期

公開API、通信契約、production挙動、公開barrel、production composeを変更していないため、
`documents/design/`、契約文書、READMEのproduction利用手順の同期は不要と判断した。
validation harnessの入力、実行境界、privacy、再実行コマンドは同一commitの
`scripts/validation/rtc-baseline/README.md` とtask artifactsへ同期した。生成物の手書き編集はない。

### Verification

- `ruff check scripts/validation/rtc-baseline` — PASS
- `ruff format --check scripts/validation/rtc-baseline` — PASS
- `ty check scripts/validation/rtc-baseline/rtc_baseline scripts/validation/rtc-baseline/runner.py` — PASS
- `pytest scripts/validation/rtc-baseline/tests -q` — 16 PASS
- `npm run gate` — lint / build / frontend testの3点すべてPASS
- `npm run tasks:index:check` — PASS
- `npm run tasks:check` — PASS
- `npm run commit:check` — PASS

## attempt 2 completion summary

attempt 2の詳細ログ、Comment audit、Verification、未実行・残リスクは上記`## attempt 2`を参照する。
実装worktreeの最終HEADは`c84249e9`でclean、Gate 0技術判定は必須実測欠測によりFAILである。

## attempt 3

独立評価の再FAILで残った7項目を、測定値を補完せずharnessのデータフローとfail-closed判定として修正した。
実装の正本は`f7835012`、再生成artifactとREADME同期の正本は`b7317c7d`である。

### 判断と評価申し送りへの対応

- remote AudioWorkletのdecode objectをpage内保存とPlaywright bindingへ同一objectで渡し、
  Python observationまで到達するfocused testを追加した。検出時刻、320ms全体の品質値、
  `MediaStreamTrack.getSettings()`、marker実間隔を観測値として保持する。
- marker sourceはICE / DataChannel / remote track準備後に接続し、ID 0受信をready条件にした。
  30分soakは一意なID `0..359`と全IDのquality updateが揃わなければ成功にしない。
- browserとbackendが同じ`rtc-baseline-coturn`を参照する固定構成にし、preflightは公開configだけでなく
  hostとbackend双方のRFC 5389 Binding応答を要求する。
- candidate POSTはHTTP成功だけでなくJSON `status: true`を要求する。再Offer中はcandidateを停止・bufferし、
  answerが返したsession IDへ保存candidateを送信してからlive送信を再開する。
- strict aggregateはmarker母集団、一意性、latency / quality母集団の一致を検査する。
  probe比較は両入力の60秒、1000ms interval、60 sample、SHA-256を必須にした。
- validation composeを`probe` / `no-probe` profileへ分離し、READMEへ同じimageを用いた排他的な起動、
  PID取得、各60秒採取、比較の固定手順を同期した。

### Comment audit

production codeは変更していないためproduction comment auditは対象外である。
validation codeのchange comprehension surfaceを次のように監査した。

| 対象                          | kind / reader question                         | 判断とaction                                                                                  |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| remote marker forwarding      | data flow / 同一eventをどこまで渡すか          | `add`: page保存とbindingへ同一objectを渡し、browser clockとtrack settingsを付加する契約を記載 |
| marker detector / source      | signal flow / 何を実測し、いつID 0を開始するか | `rewrite`: 320ms解析、次marker間隔の更新、ready後stream開始を処理段階として記載               |
| candidate router              | state transition / 再Offer中candidateの宛先    | `add`: pause、保存、replacement sessionへflush、live再開の順序を記載                          |
| STUN preflight                | environment boundary / shared coturnの実在確認 | `add`: RFC 5389 transaction照合とbrowser/backend双方の到達条件を記載                          |
| strict marker/probe aggregate | validation / 欠測やmetadata不一致をどう扱うか  | `rewrite/add`: 連番母集団、観測母集団一致、固定probe metadata/hashのfail-closed条件を記載     |

stale comment、根拠なしTODO、コメントアウトした旧実装は追加していない。

### ドキュメント同期

公開API、production通信契約、root compose、production service wiringは変更していないため、
production設計文書の同期は不要である。validation README、専用compose、scenario/run manifest、
aggregate、baseline summary、artifact/private input hashを同一ブランチで同期した。

### Verification

- Prettier validation対象 — PASS
- `ruff check scripts/validation/rtc-baseline` — PASS
- `ruff format scripts/validation/rtc-baseline` — PASS
- `ty check` — PASS
- `pytest scripts/validation/rtc-baseline/tests -q` — 45 PASS
- `npm run tasks:check` — PASS
- `npm run commit:check` — PASS
- `npm run gate`（clean `b7317c7d`）— lint / build / testすべてPASS
  （frontend 79 files / 534 tests PASS、1 file / 2 tests skipped）

### 未実行・残リスク

- 現hostはmacOSでDocker、Linux `tc` / `nsenter`、Playwright Firefox managed binaryを欠くため、
  preflightは期待どおり非0終了し、実browser / network scenarioと30分soakは開始していない。
- probeあり/なし各60秒の実系列も未取得である。公開artifactはraw 0件、probe比較欠測を補完せず
  strict Gate 0 **FAIL**として保存した。
- Linux実測hostでpreflight全PASS後に全scenarioとprobe侵襲比較を完了するまで、Phase 1移行判断には使えない。

## attempt 2

### 独立評価FAILへの対応

- Firefox executable探索をPlaywright resolved path優先とし、`PLAYWRIGHT_BROWSERS_PATH`、
  Linux XDG cache、macOS / Windows標準cacheへ対応した。Linux fixtureでXDG cache検出を確認した。
- validation composeへdigest必須coturn / Consul、4 workerのstatic service registration、
  production Dockerfile由来backend、固定STUN config、probe / telemetry共有volumeを接続した。
  preflightは実container image、backend PID、namespace内interface、Consul catalog、backend probe環境、
  公開configのSTUN、telemetry directoryをfail-closedで検査する。
- `tc netem`はhostからbackend PIDのnetwork namespaceへ`nsenter`し、selected candidate pairから得た
  backend media UDP source portだけをfilterする。TCP signaling / worker WebSocketと無関係なUDPを除外した。
- browser local / remote markerとstub JSONL telemetryをrepetition開始offset以降・同一marker IDでjoinし、
  capture-to-Python、synthesized-to-browser、end-to-end、drop、duration / 3周波数 / RMS / clipping /
  DC offset / sample rate / channel / playback speedを省略不能numeric observationへ変換した。
  clock errorは配列を空にせず、`not_available(clock_sync_error)`をmarkerごとに残す。
- config、offer HTTP、answer parse、remote description、candidate HTTP、ICE、DataChannel、audio、reconnect、
  close、timeoutをfixed enumへ分類した。detached candidate Promiseのerrorはbrowser stateへ保持し、
  primary / secondaryへ回収する。
- resource sampleへidle / connected / convergence deadlineのevent tagを付け、開始前実sampleをbaselineにした。
  AudioBroker 6 queueの個別depth / maxlenをprobe、raw、aggregate checkpointまで保持した。
- raw schema、scenario / repetition一意性、marker数、clock observation、resource / 6 queue、
  probe侵襲、manifest private input SHA-256をstrict aggregateで検査する。raw 0件も各必須checkをFAILにし、
  file数だけでPASSしない。
- stub payloadをproduction `sincro_models`の4境界でdecodeするcontract test、runner orchestration focused test、
  marker join、Linux Firefox、欠落field / 空配列 / 重複 / clock errorのnegative testを追加した。
  30分入力は巨大な一括AudioBufferからstreaming AudioWorklet generatorへ置換した。

### 実測とartifact

- harness commit `9f8d1ec5d63d77fdc4e11a388a02d6a11ad55068`をsource commitとしてmanifestへ固定した。
- 現hostでpreflightを再実行し、Darwin / Dockerなし / Linux `tc`・`nsenter`なし /
  Firefoxなしに加え、validation container wiring未起動を個別FAILとして保存した。
- 必須22 scenarioは引き続き0件である。strict aggregateではmandatory scenarioだけでなく、
  observation、resource checkpoint、probe intrusion、private input hashも欠測FAILになった。
- private preflight原本はworktreeの`work/private-artifacts/.../preflight.json`だけへ置き、
  公開artifact manifestにはSHA-256のみ同期した。raw audio、packet capture、profile、traceは生成していない。

### Comment audit

production codeは変更していないためproduction comment auditは対象外である。
validation codeの変更理解面を次のように監査した。

| 対象                         | kind / reader question                             | 判断とaction                                                                                        |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Linux preflight              | environment boundary / 何を同一実測系と認めるか    | `rewrite/add`: platform別Firefox、digest、container PID / namespace、Consul、probe、STUN条件を記載  |
| marker observation transform | data flow / browserとstubをどう対応付けるか        | `add`: repetition offset、同一CRC確認ID、clock error、drop時に推測しない契約を記載                  |
| browser failure flow         | state transition / primary stageをどう決めるか     | `add`: boundary prefix、async candidate error回収、primary / secondary保持を記載                    |
| resource checkpoint          | lifecycle / idle・connected・収束値の取得時点      | `rewrite/add`: 配列位置推測を廃止し、event直後sampleと開始前baseline、6 queue変換を記載             |
| strict raw aggregate         | validation / 何が1件でも欠けるとFAILか             | `add`: schema、一意性、marker数、clock、resource、probe、private hashのfail-closed条件を記載        |
| streaming marker source      | long-running flow / 30分入力のmemoryをどう抑えるか | `add`: AudioWorkletのcurrentFrame駆動で長時間bufferを確保しない理由とlocal marker eventの由来を記載 |

stale comment、根拠なしTODO、コメントアウトした旧実装は追加していない。

### ドキュメント同期

公開API、production通信契約、root compose、production service wiringは変更していないため、
production設計文書の同期は不要である。validation READMEへdigest取得、compose起動、service discovery、
backend PID / namespace、probe / telemetry、preflight、measurement、probe比較、strict aggregateを
一つの再現手順として同期した。manifest、aggregate、CSV、baseline summary、artifact hashも同一ブランチで再生成した。

### Verification

- `ruff check scripts/validation/rtc-baseline` — PASS
- `ruff format --check scripts/validation/rtc-baseline` — PASS
- `ty check scripts/validation/rtc-baseline/rtc_baseline scripts/validation/rtc-baseline/runner.py` — PASS
- `pytest scripts/validation/rtc-baseline/tests -q` — 40 PASS
- `npm run gate`（clean `c84249e9`）— lint / build / testすべてPASS
- `npm run tasks:index:check` — PASS
- `npm run tasks:check` — PASS
- `npm run commit:check` — PASS

### 未実行・残リスク

- 現hostにはLinux、Docker、`tc` / `nsenter`、Playwright Firefoxがないため、
  compose起動、実browser→backend→4 stub→browser、ICE loss / re-offer、30分soakは未実行である。
- coturn / Consul digestはREADMEの実host取得手順で固定する設計であり、現hostではimage digestを取得していない。
- 実測hostでpreflight全PASS後に全scenarioとprobe侵襲比較を実行するまで、Gate 0技術判定はFAILのままである。

## Completion Summary

attempt 2では独立評価の7残課題をharness、validation環境、raw/aggregate schema、focused/E2E/negative test、
README、artifactへ反映した。品質ゲートはすべてPASSしたが、現hostで実測不能な事実は補完せず、
欠測を機械判定したGate 0 FAILを正規成果として維持した。

### 残リスク

- Gate 0自体はFAILであり、Linux / Docker / netem / Firefoxを備えた実測hostで全scenarioを再実行する必要がある。
- 現hostではvalidation dependency wheelとFirefox managed binaryをinstallできず、実browser runnerは未実行。
- instrumentationなしで取得不能なPython heap、AudioBroker WebSocket、6 queueはresult schema上
  `not_available` となる。Linux fork bootstrapを実測環境で有効化し、probe侵襲比較を完了する必要がある。

## Completion Summary

再利用可能なGate 0測定harness、fixture tests、validation compose、machine-readable artifact、
privacy境界を実装し、プロジェクト品質ゲートを通した。現hostの必須条件欠損と全scenario欠測を正直に保存し、
Gate 0をFAILと判定した。実装詳細と変更内容の正本は実装commitを参照する。

### 実測不能により未検証のharness境界

今回のpreflightより先へ進めなかったため、次の境界はコード配置までで実測検証していない。
Linux実測時に不足が判明した場合は、Gate 0をPASSへ書き換えず独立修正taskとして扱う。

- `ice_failed_reoffer` のLinux `tc netem`適用・解除とICE restart制御
- marker-aware stub chainの固定recognition / text / synthesized responseとmora timing
- fork bootstrapによるPython heap、AudioBroker WebSocket、6 queueの内部観測
- resource loop / 30分soakへの1秒interval process snapshot統合とprobe侵襲比較

現commitのrunnerはこれらを取得できない場合に成功値や0を生成せず、preflight failureまたは
`not_available` としてGate 0 FAILへ落とす。このため今回artifactの判定は再現できるが、
Phase 1比較用の完全な生値取得能力はLinux実測で追加確認が必要である。

## attempt 1 addendum — 必須観測機能の完成

上記「実測不能により未検証のharness境界」で列挙した4点について、実装とfixture単体試験を追加した。
これはLinux実測結果を補完したという意味ではなく、実測hostへ持ち込むharnessの必須経路を完成させたものである。

- validation専用network namespaceへ、IPv4 UDPだけを対象にしたseed付き`tc netem`の適用・所有権付き解除を追加した。
  browser側は20秒後の100% loss、30秒以内のICE failed、netem解除、re-offer、新marker受信、
  session identityの維持または置換をそれぞれ独立fieldで記録する。
- marker decoderとstub chainを接続し、CRCで検証したmarker IDをrecognition、text response、
  synthesized WAV、mora timing、stub telemetryへ伝播するcontractを追加した。
- fork時bootstrapを追加し、子process内のPython heap、AudioBrokerの6 queue、
  4 communicator WebSocket、session identity、probe自身のCPU/RSSをUnix datagramで外部monitorへ送る。
- process treeの1秒interval resource loop、30分soak、停止後の収束判定をrunnerへ統合した。
  instrumentationなし/通信途絶/消滅を区別し、probeあり/なし各60秒の侵襲比較も独立commandにした。

追加経路はnetem command構築、marker-aware contract、fork bootstrap、Unix datagram受信、
resource集約、probe比較をfixtureで検証した。現hostにはDocker、Linux `tc`、Playwright Firefoxがないため、
実network namespace、実browser、30分soakのend-to-end実測は引き続き未実施であり、Gate 0はFAILのままである。

### 追加Comment audit

| 対象                        | kind / reader question                           | 判断とaction                                                                                 |
| --------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| netem controller            | lifecycle / 誰がqdiscを解除するか                | `add`: context owner、UDP限定filter、例外時を含むroot qdisc解除を記載                        |
| marker-aware stub contracts | data flow / markerがどこまで保持されるか         | `add`: PCM decodeからmora timingまでの変換段階とCRC不一致時の失敗契約を記載                  |
| fork probe bootstrap        | process lifecycle / fork後に何を初期化するか     | `add`: `register_at_fork`、socket ownership、heap/queue/WebSocketのbest-effort観測境界を記載 |
| resource monitor            | orchestration / 外部・内部sampleをどう統合するか | `add`: PIDごとの最新内部sample、stale期限、probe overhead控除、停止後収束判定を記載          |
| browser loss/re-offer flow  | state transition / 各判定をどう分離するか        | `add`: initial接続、ICE failed、re-offer、session identity、新markerを独立観測する理由を記載 |

stale commentと根拠なしTODOは追加していない。production codeは変更していないため、
production comment auditおよびproduction文書同期が対象外であるとの判断は変わらない。
validation READMEは追加したsocket、PID、netem interface、idle比較commandと同一commitで同期した。

### 追加Verification

- `ruff check scripts/validation/rtc-baseline` — PASS
- `ruff format --check scripts/validation/rtc-baseline` — PASS
- `ty check scripts/validation/rtc-baseline/rtc_baseline scripts/validation/rtc-baseline/runner.py` — PASS
- `pytest scripts/validation/rtc-baseline/tests -q` — 27 PASS
- `npm run gate`（追加commitのclean HEAD）— lint / build / testすべてPASS
- `npm run tasks:index:check` — PASS
- `npm run tasks:check` — PASS
- `npm run commit:check` — PASS

## attempt 2 final handoff

attempt 2の詳細ログ、Comment audit、Verification、未実行・残リスクは上記`## attempt 2`を参照する。
実装worktreeの最終HEADは`c84249e9`でclean、Gate 0技術判定は必須実測欠測によりFAILである。
