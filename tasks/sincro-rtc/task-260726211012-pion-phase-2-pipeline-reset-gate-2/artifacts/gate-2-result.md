# Gate 2実行結果

## 判定

FAIL

2026-07-26の実装worktreeでは、固定Gate commandに必要な4つのoriginと実推論backendを用意できなかった。
fake 4-stage integrationの成功を実service Gateの代替やPASSとして扱わない。

## 実行環境

- worktree:
  `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-8737c7d6f25e-hea4YV`
- OS: macOS sandbox
- Go: `go.mod`指定のGo 1.26.5
- service process: sandbox制限によりprocess一覧を取得不可
- container runtime: `docker` commandなし
- service image / commit:
    - image digest: 未取得
    - repository HEAD: 実装コミット前のため最終`impl.md`を参照
- talk mode: `sincro`
- origin: 4変数とも未設定

既存composeはSpeechRecognizerのmodel/GPU、VoiceSynthesizerのVoiceVox/S3、
各serviceのConsul agentなどを必要とする。利用可能なcontainer runtime、model、
backend、既に起動済みの4 originがないため、production composeや外部環境を変更せずに
固定Gate環境を起動する手段はなかった。

## 固定command

module rootで次の固定entrypointを、4つの環境変数がない状態で実行した。

```sh
go test -tags=gate2 -count=1 ./internal/pipeline -run '^TestGate2PythonServices$'
```

結果は`SINCRO_GATE2_EXTRACTOR_ORIGIN`の必須validationでtest failureとなった。
未設定をskipしないことは確認した。

## fixture

- path:
  `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/sample02.wav`
- repository tracking: Git管理対象。originは`git@github.com:Sincromisor/Sincromisor.git`
- 原本: 24 kHz / mono / 16-bit PCM
- 原本SHA-256:
  `3f9169ec597de0f8fc17b4b6e4f89ea05e8792f42bfb48bfa7c33277318d3759`
- deterministic nearest-neighbor変換後: 171,008 byte
- 変換後SHA-256:
  `a0375e761e7a483117a7535a5da7ed0ef0036611916a0b0e534403e551789933`

reviewでは公開repositoryの既存recognizer fixtureと確認済みで、実装でもGit trackingとhashを再確認した。
録音由来、公開許諾、個人情報を含まないことを示すrepository内metadataは独立に発見できなかったため、
実service GateをPASSにする根拠には使用していない。

## stage / reset / close観測

実serviceでは未観測であり、各deadline、reset前後generation、proxy connection countを記録できない。
したがって次はすべてFAIL扱いである。

- Extractor confirmed result
- Recognizer non-empty text
- Processor final responseとhistory
- Synthesizer encoded voice / mora / speaking time
- Recognizer切断後のgeneration +1と4接続再作成
- 再接続後の2回目の4-stage処理
- Close後のactive connection 0

fixture-backed fake integrationでは同じCoordinatorへPCMだけを投入し、4 stage、raw
ProcessorResult転送、encoded voice / mora output、reset、confirmed history継承、
Closeを確認した。これは実service Gate 2の判定には含めない。

## attempt 2

### 判定

FAIL

2026-07-27、固定commandを再実行したが、4つのoriginは引き続き未設定であり、
`SINCRO_GATE2_EXTRACTOR_ORIGIN`の必須validationで失敗した。skipは発生していない。
利用可能なcontainer runtime、model、VoiceVox/S3、Consul、または起動済み4 service originがないため、
実Python serviceのstage / reset / close観測はattempt 1から更新できない。

### 独立環境で追加した非代替検証

productionのWebSocket client setとcodecを使う4つの`httptest` serviceへ、
6つすべてのPython生成MessagePack fixtureを通すintegration testを追加した。
4 serviceそれぞれのnormal close / malformed frame / remote error、同時障害、8回連続reset、
event publicationの3 window、backpressureとCloseの競合をrace detector下で確認した。

この検証は実装のreset matrixとfixture互換性を高めるためのものであり、実serviceの推論結果、
deadline、proxy connection count、2回目のend-to-end発話を観測していない。
したがってGate 2のFAIL判定は変更せず、Phase 3開始条件を満たしたとは扱わない。

## attempt 3

### 判定

FAIL

2026-07-27、固定commandを再実行したが、
`SINCRO_GATE2_EXTRACTOR_ORIGIN`の必須validationで失敗した。skipは発生していない。
4 service originと必要backendがないため、実Python serviceのstage / reset / close観測は更新できない。

### 独立環境で追加した非代替検証

CoordinatorがExtractor identityをsession lifetimeで保持し、reset後のspeech ID再利用と
sequence ID再利用を現在generationのprotocol resetとして扱うrace testを追加した。
fixture WebSocket reset matrixは2 turn目のPython MessagePack fixture identityだけをgeneric map上で
strictly largerへpatchし、全turnのspeech / sequence単調増加を明示的に確認する。
PCM overflow countもqueue交換を跨ぐsession累積として検証した。

これらは実装品質の検証であり、実serviceの推論結果、deadline、proxy connection count、
2回目のend-to-end発話を観測していない。Gate 2のFAIL判定とPhase 3未開始条件は維持する。

## attempt 4

### 判定

FAIL

2026-08-02、4つの実Python service originを明示して固定commandを実行した。
4 service自体はrunning / healthyでWebSocket接続を開始できたが、必要backendの
`sincro-consul-server`がrestart loop中であり、最初のturnを完了できなかった。
production service、compose、container dataは変更していない。

### 実行環境

- worktree: `/tmp/eval-b9ae60daa715-MKkdo9`
- source base: `ef5aff83e5dfc549d1f18a5fe83b9036b27a2de3`
- OS: Linux x86_64
- Go: 1.26.5
- talk mode: `sincro`
- origin:
    - Extractor: `ws://127.0.0.1:8002`
    - Recognizer: `ws://127.0.0.1:8003`
    - Processor: `ws://127.0.0.1:8004`
    - Synthesizer: `ws://127.0.0.1:8005`

| service           | image digest                                                       | health  |
| ----------------- | ------------------------------------------------------------------ | ------- |
| speech-extractor  | `00dc526237f39a274a8bb046e1e67b68c7853cf13c7c4a2e6db2e98a8d27643a` | healthy |
| speech-recognizer | `cbb1b6317894fc13c7710cb1e467ea3e8edd45aaae53f3772323b95404a7951b` | healthy |
| text-processor    | `6aaf420c05398ed95f49d4b73c44415e0e0c3a897095fc75453153db7cab769b` | healthy |
| voice-synthesizer | `7a6c0c33570e9973cc6a44c1cac508780ffc9cbf3edf004d7e3f4cf051a22a9c` | healthy |

`sincro-consul-server`のimage digestは
`50b1df3b6b31a64c8f6be52c24e54a9885c196408b9bea1e21e017695ad89280`だった。
server logは、保存済みcluster stateが`server_rejoin_age_max`の168時間を超えたため
再参加を拒否し、data directoryの消去を求めている。data消去は破壊的かつ本タスクのscope外なので
実施していない。

### 固定commandと結果

module rootで次を実行した。missing originによるskipではない。

```sh
SINCRO_GATE2_EXTRACTOR_ORIGIN=ws://127.0.0.1:8002 \
SINCRO_GATE2_RECOGNIZER_ORIGIN=ws://127.0.0.1:8003 \
SINCRO_GATE2_PROCESSOR_ORIGIN=ws://127.0.0.1:8004 \
SINCRO_GATE2_SYNTHESIZER_ORIGIN=ws://127.0.0.1:8005 \
go test -tags=gate2 -count=1 ./internal/pipeline \
  -run '^TestGate2PythonServices$' -v
```

初回実行でGate testのfixture pathがpackage working directoryと不整合であることを検出した。
pathをpackage cwd基準へ修正した再実行では、RecognizerとSynthesizerが接続初期化中に
Consulから`500 No known Consul servers`を受けて切断した。Coordinatorはruntime failureを
resetへ移し、最初のPCM投入は`pipeline is unavailable`でFAILした。

### stage / reset / close観測

- 4 service WebSocket接続開始: 観測
- Extractor confirmed result: 未観測
- Recognizer non-empty text: Consul backend errorで未観測
- Processor final response / history: 未観測
- Synthesizer encoded voice / mora / speaking time: Consul backend errorで未観測
- generation reset: pipeline unavailableへの遷移まで観測、再接続完了は未観測
- reset後2回目のturn: 未観測
- Close後active connection 0: Gate成功経路では未観測

Gate testは途中FAILでもCoordinatorをdeferred `Close`するよう修正した。
実4-serviceで1 turn、reset後の2 turn目、Close後active connection 0を観測できていないため、
Gate 2とPhase 3開始条件はFAILのままとする。

## attempt 5

### 判定

FAIL

2026-08-02、attempt 4と同じ4 origin、service image、Consul restart loop環境で固定commandを再実行した。
production service、wire schema、compose、container dataは変更していない。

### 固定commandと有限cleanup

```sh
SINCRO_GATE2_EXTRACTOR_ORIGIN=ws://127.0.0.1:8002 \
SINCRO_GATE2_RECOGNIZER_ORIGIN=ws://127.0.0.1:8003 \
SINCRO_GATE2_PROCESSOR_ORIGIN=ws://127.0.0.1:8004 \
SINCRO_GATE2_SYNTHESIZER_ORIGIN=ws://127.0.0.1:8005 \
go test -tags=gate2 -count=1 ./internal/pipeline \
  -run '^TestGate2PythonServices$' -v
```

結果は30.011秒でFAILした。

```text
Start() error = initial four-service connection exceeded 30s:
start=context canceled close=<nil>
```

10分のglobal test timeoutには到達していない。Gate固有deadlineでsession lifetime contextをcancelし、
`Start`の終了を受け取ってから`Close`をjoinした。proxyのactive connectionが全serviceで0へ
収束したことを確認した後にFAILを報告しており、初回接続不能時のcleanupは観測済みである。

### field-level期待値

Gate entrypointは成功環境で次を独立deadlineとfield-level assertionにより検証する。

- Extractor: confirmed resultを15秒以内に観測し、generation / speech identityを保持する。
- Recognizer: non-empty user textを30秒以内に観測し、confirmed Extractor speech IDと照合する。
- Processor: final responseとconfirmed history commitを15秒以内に観測する。前turn historyの完全prefix、
  confirmed user identity、assistant type / text / speech IDを検証する。
- Synthesizer: 60秒以内にProcessor finalのspeech ID、non-empty message / voice / mora、
  positive speaking time、対応audio formatを検証する。
- reset: generation +1、4 serviceの接続各1件再作成、旧text / synth output 0、
  confirmed history不変を検証する。
- 2 turn目: 1 turn目historyの完全prefixを検証する。
- Close: 15秒以内に全proxy active connection 0を検証する。

今回の実環境は初回接続deadlineでFAILしたため、4 stage、reset、2 turn目のfield値は未観測である。
Consul data directory消去は破壊的かつscope外なので実施していない。Gate 2とPhase 3開始条件は
引き続きFAILとする。
