# Review: task-260726211007-pion-phase-2-pipeline-websocket-clients

## 判定

APPROVED

前回のblocking High 3件は解消された。改訂で新たな破綻はなく、残る注意点は既に確定した受け入れ条件の
実装方法に関する申し送りで足りるため、実装へ進めてよい。

## 指摘事項

- なし。

## 実装者への申し送り

- discovery / client のschema、constructor、fallback reasonの返却先、lifecycle stateとstate別error、
  event / channel close条件、Extractorのclockが `task.md:122-217` に固定され、前回のAPI契約不足は
  解消された。`client.Service` は `discovery.Service` と別のnamed typeなので、4 serviceの値を同一の
  文字列へ固定するconstまたは明示変換を一箇所に置き、eventのservice値がdiscovery側と乖離しないようにすること。
- Consul URL未設定時のfallbackと、設定済みURLのvalidation errorを混同しないこと。
  また、`task.md:32-34` のredirect拒否は注入された `*http.Client` にも適用し、nil clientの場合だけの
  保護にならないようにすること。
- service別の有限なread / write上限、上限ちょうどと上限+1 byteの挙動、
  `EventMessageTooLarge` が `task.md:62-65` に固定され、前回の受信上限不足は解消された。
  `github.com/coder/websocket` のread-limit errorをtyped判定し、一般read failureへ潰さないこと。
- `task.md:87-100` は新規exported APIをsymbol単位で全件監査し、目的、入力境界、observable output、
  state別error、副作用、ownership、非対象のretry責務まで検証するため、前回のcomment acceptance不足は
  解消された。実装時も構造改善だけをcomment省略理由にしないこと。
- `coder/websocket` の `Close` はlibrary内に固定timeoutを持つため、task指定の2秒で `CloseNow` へ
  fallbackするhelperを使う場合は、そのhelper goroutine自体も必ずjoinし、closeごとに残存しないことを
  lifecycle / race testで確認すること。
