# Review: task-260802033044-pion-phase-3-production-candidate-gate-3

## 判定

APPROVED

前回blockingだったsignaling faultの適用回数矛盾と、存在しないproduction dependency seamへのfake注入は解消された。
改訂箇所に受け入れ条件や成果物を破綻させる新たなCritical/Highはない。

## 指摘事項

- [Medium] managed panicは依存observability taskのinventory別試験結果をGate artifactへ取り込む方針になった。
  実装時は「実行結果」の参照だけで済ませず、対象commit、実行command、対象test名、各inventoryの
  close reason/process継続結果をfailure injection表へ記録し、依存成果が未実行またはFAILならGate 3も
  FAILとすること。これで「managed panicを注入する」という上位受け入れ条件との対応を機械照合できる。

## 実装者への申し送り

- signaling proxyはrequestごとにresponse sequenceをconsumeし、dropは1件後に成功、
  404/409/410は1件、429/5xx/delay terminalは3件と確定した。各caseでsequence消費数、
  request ID/revision、最終状態をartifactへ残すこと。
- codec/deadline failureはfake codec/processorをproduction constructorへ注入せず、malformed inbound RTP、
  malformed synthesizer response、timeout設定、readiness欠損peerという実入力でproduction componentを
  failureへ遷移させる。failure injection表では入力、観測metric、close reason、resource収束を対応付けること。
- Playwright/Chromium、browser fixtureと操作、ICE restart trigger、resource閾値、artifact schema、
  comment acceptanceに関する前々回の指摘も解消済みである。
