# レビュー: task-260810014729-pion-pipeline-reset-origin-logs

## 判定

APPROVED

## 根拠

- `requestReset`受理直後の一度だけのログは、既存のsingle-flight resetとgeneration遷移を変えず、
  最初のconnection failureをsession単位で確認できる。
- raw errorをログに渡さず、有限causeだけを記録するため、認識・chat・音声payloadを運用ログへ漏らさない。

## AUTO_FIX

`connectionSet.watch`のpanic callbackはserviceを空にしていたため、監視対象clientの`Service`を明示的に渡して
`EventPanic`へ設定する条件を追加した。これにより、受理したすべてのresetをservice付きで特定できる。

`internal/pipeline/client/set_test.go`でwatcher panicのservice保持も検証する。既存watch testの新引数への追随は
機械的変更であり、状態遷移を変えない。
