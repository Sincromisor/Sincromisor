# Pion Gate 3本番検証エントリーポイントを統合する

## 中止理由

既存のbrowser、pipeline、lifecycle testを列挙して再実行するだけの専用entrypointとreport schemaは不要である。
Gate 3判定は`task-260802033044-pion-phase-3-production-candidate-gate-3`で必要なcommandを直接実行し、
結果を1つのartifactへ記録する。

## 未実装

- `TestGate3ProductionCandidate`統合entrypoint
- scenario inventoryと`PASS` / `FAIL` / `NOT_OBSERVED`集約schema
- Gate専用preflightとreport生成

固定commandが繰り返し必要になり、手動実行による誤りが実際に発生した場合だけ再検討する。
