# Review: task-260627141812-character-animation-3-phase-8-roi-contract-coordinate-mappin

## 判定

APPROVED

前回 blocking だった ROI contract / utility signature、clamp 規則、ドキュメント同期の受け入れ条件漏れはいずれも解消済み。改訂で新たに実装を止める破綻は見当たらないため、実装へ進めてよい。

## 指摘事項

- なし

## 実装者への申し送り

- `SincroRoiObservation` の failure case は `source = "none"`、`confidence = 0`、warning で表現する方針に従う。`rect` は必須 field なので、missing wrist / missing face でも JSON 保存可能な有限値だけで構成する。
- `validateRoiRect()` は `finite check -> edge clip -> min size check -> confidence clamp` の順序を守り、edge clip は left/top/right/bottom を `0..1` に clip して center/size を再計算する。
- ReliabilityMap は本タスクで変更しない。ROI warning は別型として保持し、後続 reliability task で reason / warning へ明示変換する。
