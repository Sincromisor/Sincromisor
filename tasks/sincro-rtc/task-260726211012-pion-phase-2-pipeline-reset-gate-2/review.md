# Review: task-260726211012-pion-phase-2-pipeline-reset-gate-2

## 判定

NEEDS_REVISION

固定 Gate fixture と production Extractor の判定条件が矛盾し、必須 metadata も確認不能なため、
現仕様では実 4-stage Gate の成功経路を検証できない。この High は実現可能性・テスト可能性を破綻させる。

## 指摘事項

- [High] `task.md:287-305` は入力を `sample02.wav` とその固定変換 PCM に限定し、
  Extractor の `confirmed=true` を15秒以内に要求した上で「tone判定へ依存しない」としているが、
  production Extractor は `SpeechExtractorWorker.py:19-24,94-111,148-171` のとおり、受信 PCM を
  16 kHz の 3,200 samples超まで蓄積し、YAMNet の `Speech` scoreが strict `> 0.6` のときだけ
  発話を開始する。production image相当の実測では640-byte frameから作られる3,520-sample chunkに対する
  `sample02.wav` の最大scoreは `0.5859` であり、4 upstream WebSocket接続後もconfirmedは生成されなかった
  (`artifacts/gate-2-result.md:242-270`)。発話開始なしでは末尾無音を追加してもconfirmedへ遷移できず、
  Recognizer以降、reset後の2 turn目、成功経路のCloseまで到達不能である
  (`artifacts/gate-2-result.md:287-298`)。また `task.md:297-298` がGate PASSの前提にする録音由来、
  公開許諾、個人情報非包含の根拠はrepository内に存在しない
  (`artifacts/gate-2-result.md:40-54`)。診断済みの `sample01.wav` も最大 `0.5859`、
  `utils/test-nue/sample.wav` はpartialまでしか完走しておらず、source / license / consent /
  privacy metadataもないため代替として確定できない
  (`artifacts/gate-2-result.md:270-285`)。Python production threshold変更は本タスクの明示的な
  スコープ外なので、現行 production と同じYAMNet、3,520-sample chunk、16 kHz mono s16le、
  末尾無音の条件で strict `> 0.6` を満たし、confirmedまで安定して完走するfixtureを先に選定すること。
  原本・変換後PCMのhash、由来、公開・利用許諾、本人consent、privacy / 個人情報非包含の根拠を
  repository内のmetadataとして置き、fixture確定後の実測に基づいて15秒deadlineと4-stage期待値を
  再承認可能な形へ改訂する必要がある。

## 実装者への申し送り

- 既存のpipeline coordinator、generation/reset、conversation、queue、client event handoff、
  Close、fake integrationおよびcomment auditの累積実装品質は前回評価でPASS済みであり、
  今回のblocking指摘はその再実装を要求するものではない。task改訂と再レビュー後は、確定fixtureを使う
  Gate 2成功経路とreset後2 turn目、Close後active connection 0の実service観測を完了させる。
- `sample02.wav`、`sample01.wav`、`utils/test-nue/sample.wav` を、音声が聞き取れることやGit trackedで
  あることだけを根拠に採用しない。production同一条件でのVAD/confirmedの再現性と、
  repository内で第三者が追跡できるsource / license / consent / privacy根拠をfixture acceptanceにする。
- production `SPEECH_SCORE_THRESHOLD` の緩和やPython Extractorの判定変更は、現taskの解決策に含めない。
