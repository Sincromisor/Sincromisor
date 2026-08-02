# レビュー: task-260802212212-pion-gate3-harness-foundation

## 判定

APPROVED

前回残したgoroutine観測、process期限、成果物公開、enum組合せの各指摘は解消された。局所改訂による新たな重大な矛盾はなく、実装と評価の期待値は一意に追跡できる。

## 指摘事項

- なし。

## 実装者への申し送り

- goroutine収束は、`runWithBoundaries`をtest process内で動かす同一process modeだけの追加条件である。build済みPionを使う子process modeでは`Sample.goroutines=null`を維持し、test PIDの値で代用しないこと。
- `Wait(context.Context)`の期限は待機中のcallerだけを終了させ、processやbackground waiterを変更しない。`Wait`先行時にもmutex外で待ち、後続`Close`がSIGTERM、必要ならSIGKILL、joinまで進める契約を守ること。
- report公開はrenameではなく、同一directoryのfsync済み一時fileからhard link、unlink、directory fsyncの順である。link成功後のunlinkまたはdirectory fsync失敗ではtargetを削除せず、残存一時pathを含むerrorを返すこと。
- scenarioとcleanupのenum不変条件が追加されたため、許容組合せだけでなく、`PASS`と非`NONE`、`FAIL/NOT_OBSERVED`と`NONE`、cleanup `PASS`と非null error、cleanup `FAIL`とnull/空errorの拒否も試験すること。
- `Close`や`Wait`を`Start`前に呼ぶ場合など、明記されていない単一の周辺判断は既存の`ErrNotRunning`分類へ揃え、採用結果を実装コメントまたは試験名から追跡可能にすること。
