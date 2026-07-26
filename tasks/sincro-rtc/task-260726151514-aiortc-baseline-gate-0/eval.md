# Evaluation: task-260726151514-aiortc-baseline-gate-0

## 判定

FAIL

現hostで必須scenarioを実測できずGate 0技術判定を`FAIL`にしたことは正しい。本評価のFAIL理由はそれとは別で、
attempt 3でもmarker時刻とready時刻の定義違反、track/worklet観測の未検証、candidate flush競合が残り、
Phase 1から再利用できる測定harnessとして完了していないためである。

前回7残課題のうち、同一marker eventの転送、ready後ID 0開始とsoak母集団、coturnの共有aliasと到達性preflight、
candidate `status:false`、marker/probe strict check、probe有無の固定profileは改善を確認した。

## 受け入れ条件チェックリスト

- [✓] aiortc宣言 / lock / runtimeを別fieldで記録
    - manifest / preflightは`>=1.13.0`、lock `1.14.0`、runtime `1.14.0`を分離し、独立preflightでも
      3 checkがPASSする構造を確認した。
- [✗] Chrome / Firefox × host / STUN ×4 close modeを各20回測定
    - 16 scenario、各20 repetition、Chrome stable非fallback、Linuxを含むFirefox resolved path探索、
      fixed failure stage、`initialReady`と`scenario.result`の分離は実装された。
    - ただし`awaitRtcReady()`はICE connected/completed、両DataChannel open、remote trackの後にsourceを開始し、
      marker ID 0のdecode完了まで待つ。要求する`t2`は「最初の非無音remote frame」到着時点だが、
      現実装は約320msのmarkerと往復処理の完了時点を`t2`にするため、`mediaReadyLatencyMs`が別の指標になる。
    - candidate routerは`resume()`冒頭で`paused=false`にしてからbufferを逐次POSTする。最初のPOST待機中に
      新candidateが来るとbuffer済みcandidateを追い越してlive送信され、replacement sessionへ保存順でflushしてから
      live送信を再開する契約を満たさない。
- [✓] 10 / 50 / 100 normal close、100 abrupt closeのresource測定構造
    - 1秒interval、開始前baseline、`idle` / `connected` / `convergenceDeadline`のevent tag、
      CPU/RSS/heap/thread/child/fd/TCP/UDP/WebSocket、6 queue個別depth/maxlenをraw/aggregateへ保持する経路を確認した。
- [✗] Chrome / Firefox各30分の双方向音声latency / 品質測定
    - sourceはready条件成立後にmarker ID 0から開始し、remote eventもpageとPlaywright bindingへ同一objectを渡すよう
      改善された。320ms marker全体のRMS、検出時刻、次marker間隔を使う品質計測も追加された。
    - しかしlocal marker eventの`audioTimeSeconds`はsource接続後の`generatedFrames / sampleRate`であり、
      AudioContext生成時刻からsource接続までのoffsetを含まない。runnerはこれをAudioContextの絶対zeroへ加えるため、
      実際のlocal marker開始よりICE/DC/remote-track待機時間だけ早い時刻を生成する。
      `captureToPythonMs`と`endToEndMs`は欠測にならず、誤った大値のままstrict gateを通り得る。
    - remote workletはworklet bufferのsample rate/channelとtrack settingsを双方送るが、Python raw observationは
      track settingsだけを`sampleRate`/`channels`へ保存し、worklet値を破棄して一致確認しない。
      要求する「track settingsとworklet bufferから検証」がartifactに残らない。
    - track settings欠測は汎用`not_available`になり、strict aggregateは`clock_sync_error`以外の
      mandatory observation欠測をFAILにしないため、必須観測なしでもGate 0 PASSになり得る。
    - marker ID 0では1300Hz symbolが存在しないのに、空segmentのfrequency探索がscan下限値を返すため、
      実測不能な成分を欠測ではなく数値として記録する。
- [✓] normal / ICE failed / abrupt close後のresource収束
    - resource収束のbaseline、event tag、deadline、6 queue経路は実装され、成功/失敗scenarioの終了条件と
      resource convergenceは分離されている。
    - scenario correctnessに上記candidate競合は残るが、resource収束条件そのものの実装は受け入れ条件を満たす。
- [✗] manifestで環境・手順を固定しPhase 1から再利用
    - source commit、seed、duration、回数、network、browser/OS、image digest、interval/deadlineは固定され、
      composeにはConsul、4 stub、backend、coturn、probe/telemetry、namespace netemが接続された。
    - hostは共有aliasを`/etc/hosts`へ解決し、backend containerは同aliasでcoturnへ到達する。preflightも
      host/backend双方からRFC 5389 Bindingを送るため、前回のloopback誤配線は解消した。
    - probe有無は固定compose profile/commandで起動できるようになった。
    - ただしmarker clockと`t2`がtask定義と異なるため、manifestどおり再実行してもPhase 1の比較基準となる
      latencyを生成できない。
- [✗] 欠測のないGate 0 PASS条件
    - 0 raw時にscenario、observation、resource、probe、private hashをFAILにする現artifactは正しい。
    - strict aggregateはscenario/repetition、marker ID集合、probe duration=60秒、interval=1秒、60 sample、
      SHA-256形式、clock error、checkpoint、6 queueを検査するよう改善された。
    - しかしtrack/worklet sample rate/channelを別々に保持・照合せず、汎用`not_available`も必須観測FAILへ
      接続しないため、必要な音声観測を欠いたGate 0 PASSを排除できない。
- [✓] 公開artifactとprivacy境界
    - baseline summary、manifest、CSV、aggregateは必須22 scenario count=0とGate 0 FAILを保持し、
      environment blockerとbackend不具合を分離している。
    - raw/private診断をcommitせず、private preflightはSHA-256のみ公開している。
    - artifact manifestのrun manifest / aggregate / marker spec hashは独立計算と一致した。
- [✗] offline集計 / 実測分離、fixture、欠測schema
    - raw schema、marker join、browser runner、Linux Firefox、resource monitor、production Pydantic model、
      strict negative caseを覆う45 testは独立PASSした。
    - ただしlocal workletのrelative frameをAudioContext絶対時刻へ変換する結合test、最初の非無音frameと
      marker decodeを分ける`t2` test、track/worklet値の一致・欠測test、`resume()`中にcandidateが到着する
      concurrency testがない。局所fixtureが完成済みtimestampを直接与えるため実data-flowのclock defectを見逃す。
- [✗] comment品質
    - production code未変更のためproduction comment auditは対象外。validationのpublic function、
      orchestration、state/data flowには概ねreader-orientedなコメントがある。
    - ただしREADMEが説明するmarker latency観測とsample rate/channel確認は、local clock offsetの欠落および
      worklet値を破棄する実装と一致しない。candidate routerの「flush後にlive送信再開」というコメントも、
      `paused=false`を先に設定する実コードとstaleになっている。
- [✓] 品質コマンド
    - clean commitでroot gate、Ruff、format、ty、45 focused tests、task tooling、commit checkはすべて成功した。

## 前回7残課題の再評価

1. 同一remote marker eventのpage/binding転送 — **解消**
    - `browserMarkerStartMs`を含む同一eventを保存し、Playwright bindingへ渡す。
2. ready後ID 0開始 / 30分soak母集団 — **部分解消**
    - source開始と0..359母集団は解消したが、local marker clock offsetと`t2`定義が誤っている。
3. coturn共有経路 / 実到達性preflight — **解消**
    - hostとbackendで共有aliasを使い、双方からBindingを検証する。
4. candidate `status:false` / replacement buffer — **部分解消**
    - `status:false`は失敗扱いになった。replacement IDへのbuffer送信も追加されたが、flush中のlive candidateが
      bufferを追い越す競合が残る。
5. marker母集団 / probe metadata strict check — **解消**
    - marker ID集合とprobeのduration、interval、sample count、hash形式をnegative testを含め検証する。
6. probe有無の固定起動profile — **解消**
    - no-probe/probe profileが別commandで再現できる。
7. audio quality / track設定確認 — **部分解消**
    - 320ms全体とmarker間隔による測定は改善。track/worklet両値をartifactへ保持・照合せず、
      存在しないsymbol周波数を数値化する問題が残る。

## テスト結果

- `npm run gate` — PASS（clean `b7317c7d`; cache hit）
    - lint: PASS
    - build/type check: PASS
    - frontend test: 534 passed / 2 skipped
- `uv run --group dev --group sincro-rtc --group validation ruff check scripts/validation/rtc-baseline`
  — PASS
- `uv run --group dev --group sincro-rtc --group validation ruff format --check scripts/validation/rtc-baseline`
  — PASS（34 files）
- `uv run --group dev --group sincro-rtc --group validation ty check scripts/validation/rtc-baseline/rtc_baseline scripts/validation/rtc-baseline/runner.py`
  — PASS
- `uv run --group dev --group sincro-rtc --group validation pytest scripts/validation/rtc-baseline/tests -q`
  — 45 passed
- `npm run tasks:index:check` — PASS
- `npm run tasks:check` — PASS（260 tasks）
- `npm run commit:check` — PASS
- artifact SHA-256独立照合 — PASS
    - run manifest: `d39aa...df56`
    - aggregate: `328f...45a`
    - marker spec: `2c079...001a`
- 現host preflight / artifact — expected FAIL
    - 必須Linux、Docker/tc/netns、Firefox、実containerがないためscenario count=0。
    - この環境制約はGate 0技術判定へ正しくFAIL反映されている。
- 実Docker compose、実browser→backend→4 stub→browser、ICE loss/re-offer、30分soak — 未実行
    - 現host制約による未実行自体は実装評価FAILの理由ではない。

### カバレッジ評価

45 focused testとstrict negative testは前回より改善した。しかし最重要のlocal marker clockはPython変換へ
完成済みtimestampを渡すfixtureしかなく、source接続時のframe originとAudioContext absolute zeroのずれを覆わない。
`t2`、track/worklet一致、candidate flush concurrencyも未検証であり、緑のtestではPhase 1再利用性を保証できない。

## ドキュメント整合性

- production公開API / 通信契約 / root compose / production service wiringの変更: なし。
  attempt 3差分はvalidation harness/tests/config/composeとtask artifactに限定され、production設計文書同期は対象外。
- validation README / artifact: **一部未同期**
    - artifactの0 scenario、欠測、Gate 0 FAIL、privacy境界、coturn共有経路、probe profileは実装と整合する。
    - marker latencyの時刻基準はsource接続offsetを欠く実装と整合せず、track settingsとworklet bufferの双方で
      sample rate/channelを検証するとの説明もraw observation実装と一致しない。
    - candidate flushのコメントはlive送信再開順序と一致しない。

## 残課題（FAIL の場合）

- local marker IDはsource開始基準のまま維持しつつ、event時刻には実AudioContext時刻
  （例: source開始時`currentFrame` offsetを含む値）を渡す。source worklet→page→binding→Pythonを通す結合testで、
  ready待機時間を加えても3 latencyがtask定義どおりになることを確認する。
- `t2`用の最初の非無音remote frame eventと、marker ID 0の往復成功条件を分離する。
  `mediaReadyLatencyMs`には前者だけを使い、初回marker decodeはscenario成功の別条件として保持する。
- raw observationへtrack settingsとworklet bufferのsample rate/channelを別fieldで保持して一致を検証し、
  片方の欠測・不一致をstrict Gate 0 FAILへ接続する。存在しないsymbol成分は偽の周波数ではなく
  `not_available`または測定対象外としてschema上明示する。
- candidate routerはbufferを完全にflushするまでpaused状態を維持し、flush中に来たcandidateも順序どおり
  replacement sessionへ送る。競合を再現するfocused testを追加する。
- 上記実装に合わせてvalidation READMEとcandidate orchestration commentを同期する。

## Completion Summary

attempt 3対象commit `b7317c7d72ff`の独立再評価は **FAIL**。root gateと全品質コマンド、45 focused testsは
PASSし、前回のremote event転送、coturn到達性、strict marker/probe checks、probe profileは改善した。
一方、local marker時刻がsource接続offsetを失いlatencyを誤計算すること、`t2`が最初の非無音frameではなく
marker decode完了になること、track/worklet観測を照合しないこと、candidate flush中の追い越し競合が残る。
したがってPhase 1再利用可能なharnessとして受け入れ条件を満たさない。
