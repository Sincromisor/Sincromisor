# Evaluation: task-260802032908-pion-phase-3-outbound-audio-datachannel

## 判定

FAIL

attempt 3の評価対象は`20fe9cca6db242893fd45ebe367574dadf91c78d`。前回指摘した
production Pion境界へのdrop metadata伝播は解消したが、speech abort分岐でpacketを書かなかった
現在のdeadline 1 slotを`pendingDrops`へ数えておらず、実RTP clockが1 frame短くなる。

## 受け入れ条件チェックリスト

- [✓] 48 kHz mono / 960 sample Opusとabsolute clock —
  `pendingDrops`は`media.Sample.PrevDroppedPackets`へ渡され、production
  `pionSampleWriter`もmetadataを保持する。silence drop後のPion timestamp / sequence gapと通常cadence復帰を
  local pairで確認した。ただしspeech abort時の1 slot不足は下記lag条件を不合格にする。
- [✓] speech bounded queue — 8発話、120秒ちょうどまで受理し、超過incomingだけを拒否する。
- [✓] generation stream / barrier — 単一consumer、単調適用、resetのadvance→drain→notify、
  coalesce、close ownership、decode後再検査を維持する。
- [✗] scheduler lag / speech abort —
  silenceおよび250 ms以下のspeech lagは同じtimer tick内で現在packetを1件書くため、
  `floor(lag/20ms)`をdrop数とする実装で正しい。一方250 ms超過branchはcurrent speechをabortし、
  そのtickではpacketを書かず`continue`して次発話を`now+20ms`から開始する。この経路でも
  `skipSamplePositions(floor(lag/20ms))`しか呼ばないため、現在処理中のdeadline packet 1件が
  drop metadataに含まれない。
  例としてlag=`250ms+1ns`なら期限切れ12 slotに加えてabortしたcurrent deadlineの1 slotも未送信であり、
  次の成功packetは`PrevDroppedPackets=13`、直前成功packetからtimestamp delta=`14*960`、
  sequence delta=14であるべきだが、実装/testは12、`13*960`、13相当を期待する。
- [✓] DataChannel queue、JSON、hysteresis、channel別error policy — attempt 2の実装を維持する。
- [✓] mora/telop per-frame変換とaudio/event purge — 元message、nil/empty、sample timing、
  `new_text`、frame境界規則を維持する。
- [✓] lifecycle / close ownership — attach開始権とWaitGroup予約の同一mutex化、closed-aware
  output/dispatcher、decode完了競合、worker join後のclosed公開に回帰なし。
- [✗] change comprehension surface comment audit —
  `OutputSample` / `pionSampleWriter`の前回stale commentは修正され、通常dropのproduction seamを正しく
  説明する。しかし`skipSamplePositions`は「送らない20 ms slot」を累積すると説明しながら、
  speech abortで送らなかったcurrent slotをcallerが渡していない。attempt 3 auditもabort後drop数12を
  正しいものとしており、実際のno-write state transitionを説明・検証できていない。

## 前回残課題の再照合

- `PrevDroppedPackets` production伝播: 解消済み。
- 成功write後の`pendingDrops=0`: 解消済み。
- 連続drop累積、32 bit wrap、uint16超過error: 解消済み。
- local Pionで4 drop後のtimestamp delta=`5*960`、sequence delta=5、その後960 / 1復帰: 解消済み。
- speech abort: current no-write slotのoff-by-oneが残る。
- attempt 2 lifecycle修正: 回帰なし。

## テスト結果

- `go test ./internal/media ./internal/rtc ./internal/pipeline` — PASS。
- `go test -race ./internal/media/... ./internal/rtc ./internal/pipeline` —
  変更中心の`internal/media`と`internal/rtc`はPASSを確認。十分なFAIL根拠確定後に長時間実行を中止したため
  全指定package完走は未確認。
- `go vet ./...` — PASS。
- `git diff --check aa40551..20fe9cc` — PASS。
- 変更production Go fileの`gofmt -l` — 出力なし。
- `npm run gate` — 指定worktreeにdependency symlinkがなく`biome: not found`で環境失敗。
  実装者はclean SHAで3点PASSを記録している。
- task tooling — `tasks:check` PASS（273 task）、`tasks:index:check`変更なし、
  `npm run commit:check` PASS。

追加された`TestOutputConsecutiveDropsAccumulateUntilSuccessfulWrite`とproduction local pair testは
silence/手動skipを十分に固定する。一方
`TestOutputSpeechLagBoundaryAbortOrderAndNextCadence`はabort後の
`PrevDroppedPackets=12`を期待しており、現在tickでwriteしなかった1 slotを誤って仕様化している。
speech abortをlocal Pion gapまで接続するtestもない。

## ドキュメント整合性

`documents/design/contracts/frontend-rtc.md`へ、drop slotを次RTP packetのtimestamp/sequence gapへ反映し、
その後960 / 1へ復帰する公開挙動を同期済み。wire schema、endpoint、設定、生成物の追加変更なし。
文書の期待は正しいが、speech abort経路の実装がその期待より1 slot短い。

## 残課題

- speech abort branchで、`floor(lag/FrameDuration)`に加えて現在のno-write deadline 1 slotを
  `pendingDrops` / `samplePosition`へ加える。概念上は
  `skipSamplePositions(uint64(lag/FrameDuration) + 1)`となる。
- fake clock testのlag=`250ms+1ns`ではabort後の次成功sampleに
  `PrevDroppedPackets=13`、logical sample positionも現状より960先を期待する。
- production local Pion pairでもspeech abortを発生させ、直前成功packetから次発話packetまでの
  timestamp delta=`14*960`、sequence delta=14、その次が960 / 1へ復帰することを固定する。
- `skipSamplePositions`近接commentとattempt 3 comment auditへ、abort tick自身をdropに含める理由を同期する。
