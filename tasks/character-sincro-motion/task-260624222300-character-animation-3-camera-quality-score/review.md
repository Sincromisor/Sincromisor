# Review: task-260624222300-character-animation-3-camera-quality-score

## 判定
APPROVED

前回 blocking だった component score / overall.status、borderRisk、motionBlurRisk の判定規則はいずれも受け入れ条件で一意化されている。guide message の優先順位も明文化され、残る曖昧さは実装者への申し送りで扱えるため、実装に進ませてよい。

## 指摘事項
- [Medium] guide message の reason code 優先順位は定義済みだが、各 reason code から 5 種類の固定文言へ変換する対応表は task.md に明示されていない（`task.md:25`）。同じ文言に複数 reason が対応する場合の code / severity 採用規則はあるため blocking ではないが、実装時は reason code -> text の固定テーブルを作り、テストで期待文言を固定すること。

## 実装者への申し送り
- `components.*.score` は `good = 1`、`warn = 0.55`、`bad = 0`、`unknown = 0`、`overall.score` は unknown を含む全 7 component 平均、`overall.status` は task.md の閾値どおりに実装する（`task.md:16`, `task.md:92`）。
- `borderRisk` は torso / hands の対象点を集約する独立 component として、全欠損は `unknown`、外側は `bad`、border distance `< 0.04` は `bad`、`< 0.08` は `warn` にする。torso と hand の reason が両方出る場合は両方を `reasonCodes` に含める（`task.md:22`）。
- `motionBlurRisk` は v1 proxy に限定し、cadence `bad` または actual `frameRate < 8` を `bad`、actual `frameRate < 10` または低 confidence 継続を `warn` とする。pixel blur 検出は入れない（`task.md:24`）。
- raw `deviceId` / `groupId` / `label` を保存しない scrub 方針、`frame.metrics.cameraQuality` への保存、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` の同期は受け入れ条件として維持されている（`task.md:17`, `task.md:27`, `task.md:30`）。

## 残リスク
- guide message の code -> text 対応表が task.md にないため、実装者が自然言語から妥当な対応を決める必要がある。ただし文言候補、最大件数、reason 優先順位、重い severity の採用規則は固定されているため、成果物の形を変える blocking な未確定ではない。
- actual `frameRate` が欠損する場合の `motionBlurRisk` は、task.md の比較条件に該当しないものとして cadence と pose confidence から判定する実装になる想定。ここはテスト fixture で欠損時に throw しないことを押さえるとよい。

## 確認観点
- 前回 High の「component score と overall.status の算出規則」は `task.md:16` と `task.md:92` で解消済み。
- 前回 High の「必須 component の borderRisk 仕様欠落」は `task.md:22` で解消済み。
- 前回 High の「motionBlurRisk の warn / bad 切り分け未確定」は `task.md:24` で解消済み。
- 前回 Medium の「guide message reason code 優先順位未定義」は `task.md:25` で解消済み。
- 改訂箇所により新たな Critical / High 相当の矛盾、公開挙動変更に対するドキュメント同期漏れ、または既存保存先との破綻は確認されなかった。
