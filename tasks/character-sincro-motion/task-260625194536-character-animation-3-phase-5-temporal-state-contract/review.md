# Review: task-260625194536-character-animation-3-phase-5-temporal-state-contract

## 判定
APPROVED

前回 blocking だった `TemporalUpperBodyState` / `TemporalHeadState` の保存 shape、default factory の neutral 値、`TemporalTuple3` export 方針はいずれも task.md に明記された。改訂箇所に起因する新たな Critical / High の破綻は見つからないため、実装に進めてよい。

## 指摘事項
なし。

## 実装者への申し送り
- `TemporalTuple3` は export 一覧に追加済みで、public field の型参照として利用できる前提で実装する。
- `head` は optional であり、`createDefaultTemporalUpperBodyState(mediaTimeMs)` では省略、`{ includeHead: true }` 指定時だけ lost / neutral の head を生成する。default snapshot test ではこの差分を明示的に確認する。
- default arm scalar は task.md の固定値（`reach: 0.35`、`elevationRad: -0.25`、`openness: 0.15`、`forwardness: 0.15`、`elbowFlexionRad: 1.15`、`classification: "side"`）を正本にし、`bodyLocalWrist` / `bodyLocalElbow` は省略する。
- 保存 shape は JSON 保存可能な plain object に限定し、既存の `CanonicalUpperBodyState` / `ReliabilityMap` と同じく schema version、finite number、lower-case enum、strict object、unknown schema の先行判定を踏襲する。
- `frame.temporal` optional slot と motion-debug viewer の `temporal` layer key は既存予約と整合している。表示接続は task.md のスコープ外のまま扱う。
- developer-visible な motion pipeline contract の追加なので、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` の同期を受け入れ条件どおり実施する。
