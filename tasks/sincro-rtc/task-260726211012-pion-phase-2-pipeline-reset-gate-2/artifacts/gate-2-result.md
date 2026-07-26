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
