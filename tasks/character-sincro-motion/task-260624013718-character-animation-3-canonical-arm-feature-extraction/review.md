# Review: task-260624013718-character-animation-3-canonical-arm-feature-extraction

## 判定
APPROVED

前回の Blocking High 2 件は task.md:13 と task.md:39-47、task.md:60-89 で解消済み。改訂箇所に実装を破綻させる新たな Critical / High は見当たらないため、実装へ進めてよい。

## 指摘事項

- なし

## 実装者への申し送り

- `extractCanonicalArmState(input)` は `CanonicalSingleArmFeatureInput` を受け、指定 side 1 本分の `CanonicalArmState` だけを返す前提で実装する。`createCanonicalUpperBodyState()` 側で左右 map、timestamp、calibration、head を組み立てる。
- `forwardness` は task.md:60-89 の `projectionShortening` 式と利用可能成分だけの重み再正規化をそのまま使う。world Z 欠損と projection shortening 欠損だけでは confidence を下げない。
- confidence clamp 条件は task.md:99-103 に従う。特に torso fallback / world coordinate fallback / arm length 不正 / lost joint を混同せず、unit test で境界を固定するとよい。
