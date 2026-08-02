# Evaluation: task-260802032908-pion-phase-3-outbound-audio-datachannel

## 判定

PASS

評価対象は `0d8c11aeeab0f6bd5901206b0830c0b330a1fcc5`。指定された隔離 worktree の
clean treeで独立評価した。review.md に Critical / High の未解消指摘はない。前回評価で残った
speech abort時のcurrent deadline 1 slotの不足は、logical sample positionと
`media.Sample.PrevDroppedPackets`の双方へ加算され、fake clockとproduction Pion pairで修正を確認した。

## 受け入れ条件チェックリスト

- [✓] 48 kHz mono PCM / 20 ms / 960 sample Opusとsession absolute clock —
  `OutputProcessor.Run`、`FrameEncoder`、`pionSampleWriter`を照合した。queue空時のsilence、
  browser入力非依存の50 frame cadence、64 bit logical position、32 bit RTP wrap、production
  packetizerまでのdrop metadataをテストが固定している。
- [✓] bounded speech queueとoverflow policy —
  8発話および5,760,000 sample（120秒）ちょうどを受理し、追加後に超えるincomingだけを
  `ErrSpeechQueueFull`で拒否する。既存itemをevictせず、拒否resultからtelopを生成しない。
  queue/action/countのlogとpayload非保持statsもある。
- [✓] stable generation stream / reset barrier —
  初回generationをproducer開始前に通知し、resetは`outputMu`内でadvance、text/synth drain、
  capacity 1の最新generation通知を順に確定する。Coordinatorだけが全producer join後に3 channelを
  closeする。
- [✓] consumer側generation barrier —
  `generationLoop`だけが`GenerationChanges`を受信し、text/synth envelopeも単調な
  `outboundGeneration`適用点へ集約する。newer観測時はaudio/text/telopを同じcritical sectionでpurgeし、
  older envelopeを拒否する。次generation outputがない通知単独purgeとdecode完了競合をテストしている。
- [✓] scheduler lag policy —
  期限切れsilenceと250 ms以下のspeech lagはburst送信せずslotをdropする。250 ms超過では現発話の
  audio/moraを中止し、完全に期限切れの12 slotにcurrent no-write deadline 1 slotを加えた13 dropを
  次sampleへ渡す。production pairで直前packetからtimestamp/sequenceが14 frame進み、その次から
  960 / 1 cadenceへ戻る。
- [✓] DataChannel dispatcher / queue / JSON boundary —
  `text_ch`は64件FIFOでincoming reject、`telop_ch`は128件でoldest drop。payloadはUTF-8 JSON textかつ
  64 KiB以下で、chat schemaのsnake_case、`expression_code`のnil欠落/zero保持をfixtureで確認している。
- [✓] DataChannel backpressure / failure policy —
  1 MiB以上で抑制し、256 KiB以下まで最大5秒待つ。timeout、channel close、reliable text failureは
  session error、unreliable telopの単発送信失敗はevent dropで継続する。generation purgeは待機中の
  stale eventを中断する。
- [✓] audio / mora / telop同期 —
  decode前messageをqueue itemへ保持し、各frame開始sampleでactive moraを選ぶ。timestamp、length、
  nil/empty、`new_text`、frame内境界の次frame切替、active moraなしのaudio-onlyを共有fixtureで固定し、
  telop sinkをtrack write直前に呼ぶ。abort/purge時は未送信eventも残らない。
- [✓] resource lifecycle —
  text/synth channel close、codec/track error、session closeでcontext、timer、encoder、queue、dispatcher
  worker、pipeline producerを回収する。attach開始権とWaitGroup予約は同じmutexで直列化され、
  post-close enqueueも拒否する。
- [✓] Session lifecycle契約 —
  outbound trackはAnswer前に登録し、RTCP drainと4 outbound goroutineはconnected時にlifecycle mutex内で
  一度だけ予約する。DataChannelの属性、同label object identity、OnOpen identity、audioを含むreadiness
  AND latchを維持し、全resource/goroutine join後だけclosed/registry removeを公開する。
- [✓] change comprehension surface comment audit —
  attempt 1の所定9列表が累積production差分のclock、queue/drop、generation、audio/event同期、
  DataChannel backpressure、orchestration、state、boundary、lifecycleを網羅し、attempt 4の所定9列表が
  最終off-by-one修正と直接surfaceを再監査する。attempt 2/3の補足表は簡略列だが、初回全件表と最終9列表を
  置換するものではない。実コードと照合した範囲に逐語説明、確認先だけの説明、失敗mode欠落heuristic、
  stale comment、定型的省略理由、不完全TODOは認めなかった。

## テスト結果

- `npm run gate` — PASS（clean SHA `0d8c11a`）。
    - `gate:lint`: PASS（593 files checked、fixなし）
    - `gate:build`: PASS（880 modules transformed）
    - `gate:test`: PASS
- `GOCACHE=/tmp/eval-phase3-go-build GOMODCACHE=/tmp/eval-phase3-go-mod go test -race ./internal/media/... ./internal/rtc ./internal/pipeline`
  — PASS（`internal/media`、`internal/media/synthdecode`、`internal/rtc`、`internal/pipeline`）。
- `GOCACHE=/tmp/eval-phase3-go-build GOMODCACHE=/tmp/eval-phase3-go-mod go vet ./...` — PASS。
- `git diff --check f19de61..0d8c11a` — PASS。
- 変更production Go fileへの`gofmt -l` — 出力なし。
- 最初のrace test試行はsandboxの既定Go cacheがread-onlyで失敗し、`/tmp`の専用cacheへ切り替えた。
  依存取得時のnetwork制限後、許可された同一コマンドを再実行して上記PASSを得たため、実装失敗ではない。

カバレッジは受け入れ条件に対して十分である。特にqueueの件数/sample境界、generation通知単独purge、
DataChannel overflow/64 KiB/high-low-timeout/error policy、telop sample fixture、Close競合、
browser入力非依存50 frame、mono encode/stereo SDP decode、silence dropとspeech abortのproduction RTP gapを
focused testで固定している。実browser jitter buffer後の聴感品質は未検証だが、タスクのスコープ外であり、
local Pion pairがpacketizerまでの公開clock挙動を検証している。

## ドキュメント整合性

公開挙動の変更あり。`documents/design/contracts/frontend-rtc.md`へ次を同期済みである。

- text/telopのqueue容量、overflow policy、UTF-8 JSON / 64 KiB
- 1 MiB / 256 KiB / 5秒のbufferedAmount policyとchannel別failure policy
- 48 kHz / 960 sample / 20 ms、silence、250 ms speech abort、RTP timestamp/sequence gapとcadence復帰
- telopのmessage、timestamp、length、nil/empty、per-frame cadence、`new_text`、mora境界、generation purge

PoC READMEの実payload、outbound動作、smoke確認も同期済み。endpoint、既存field/path、設定、公開barrel、
生成物の変更はなく、`documents/design/index.md`の新規導線やschema再生成は対象外である。

## コメント照合範囲と残リスク

変更されたproduction 13 fileと、それらの直接surfaceであるclock/timer/encoder、queue/send barrier、
generation publication/application、DataChannel worker/backpressure、Session readiness/cleanupを照合した。
未照合のproduction変更範囲はない。テストhelper内の説明はproduction comment acceptance対象外だが、
最終production pair testの13-drop / 14-frame deltaとrecovery assertionは実装コメントと照合した。

残リスクは実browser jitter buffer後の聴感品質と250 ms閾値の運用妥当性で、いずれもtask.mdの
スコープ外である。約21.8分を超える単一連続dropはPionの`uint16`表現上限によりsession errorとなるが、
誤ったRTP clockで継続しない安全側の明示的failureである。
