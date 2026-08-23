# コーディング規約(TypeScript)

> **Scope**: TypeScriptコードベース横断のコーディング規約(型運用 / エラー / ログ / テスト / import / null / 日付 / TODO / env / 言語)
> **AGENTS.md との関係**: [AGENTS.md](../../AGENTS.md) は初動ガイドと正本リンクを保持する。サイズ閾値 / 分割判断 / 主要アンチパターンは [code-structure.md](code-structure.md)、コメント品質の横断基準は [source-comments.md](source-comments.md) を正本とし、本書は TypeScript 固有の横断ルールを保持する。

## 0. 設計思想

PoC では下記 2 軸を最優先する。

1. **負債が残りにくい方向を選ぶ** — 後から剥がす工数が大きいもの(型を緩める / null と undefined を混在させる / env 直参照を許す)は最初から禁止する
2. **debug と更新がしやすい状態を維持する** — 「沈黙する失敗」「観測できない状態」「変更影響が読みにくい依存」を作らない

ルールは原則 hard。**破る場合は同じ行に `// reason: <理由>` を付ける**(レビューでの差し戻し基準は理由の有無)。

## 1. TypeScript 型運用

| ルール                                               | 強制度 | 補足                                                    |
| ---------------------------------------------------- | ------ | ------------------------------------------------------- |
| `any` 禁止。外部 I/O は `unknown` で受けて Zod parse | hard   |                                                         |
| 型アサーション (`as Foo` / `as unknown as Foo`) 禁止 | hard   | `as const` のみ可                                       |
| non-null assertion `!` 禁止                          | hard   | ガード節 / Zod parse で潰す                             |
| `@ts-ignore` 禁止                                    | hard   | —                                                       |
| `@ts-expect-error` 可                                | soft   | 直後に `// reason: ... / 解消条件: ...` 必須            |
| 公開 (export) 関数の戻り値型を明示                   | soft   | inference 任せにすると変更時に signature が静かに変わる |
| `import type { X }` で型のみ import を分離           | soft   | tree-shaking + 「型を実体と取り違える」事故防止         |

**Why**: `any` / `as` / `!` は「型は通っているが実体が違う」状態を作り、debug を最も困難にする。PoC で導入すると剥がし切れずに負債化する。

**How to apply**: 既存コードに残っていたら、触った箇所から順に潰す。WebRTC DataChannel / 設定 JSON / ブラウザ API / 外部ライブラリの型不整合は、境界専用の変換層を一枚挟み、生のレスポンスやイベント値をそこで吸収する。

## 2. Lint / フォーマッタ / コミット前チェック

| 項目                          | ツール                            |
| ----------------------------- | --------------------------------- |
| Lint (TS / JS / JSON)         | **Biome**                         |
| フォーマッタ (TS / JS / JSON) | **Biome**                         |
| フォーマッタ (Markdown)       | **Prettier**(`*.md` のみスコープ) |
| 型チェック                    | TypeScript (`npm run build` 経由) |
| テスト                        | `npm run test`                    |

- Biome の設定は [biome.json](../../sincromisor-frontend/biome.json) を正本とする。lint は `recommended` を有効化し、PoC で支障が出る項目のみ明示オプトアウト
- Prettier は **Markdown 専用**。Biome 2.x が Markdown 未対応のため、ドキュメント整形だけ Prettier を残す。設定ファイルを導入する場合はリポジトリ直下に置き、`*.md` のみに適用する
- コミット前の確認項目:
    1. `npm run build`(型チェック + Vite build)
    2. `npm run check`(Biome lint+format / Prettier md)
    3. `npm run test`(変更レイヤ)
- lint 警告を局所的に抑制する場合は `// biome-ignore <rule>: <reason>` を付ける(本書 §0 の `// reason:` ルールに準ずる)
- pre-commit hook (lefthook / husky 等) は現時点で未導入。コミット漏れによる手戻りが見えた時点で導入を検討する

**Why**: lint と format の取りこぼしは手動チェックでは必ず発生し、後で大量修正の負債になる。Biome は単一バイナリで TS / JS / JSON の lint + format を兼ね、Prettier は Markdown 専用に限定することで設定衝突を最小化する。Biome が Markdown 対応した時点で Prettier を撤去する(本書 §2 を更新する宿題)。

**How to apply**: 現時点では `npm run build` と `npm run check` を最低確認とする。テスト対象を変更した場合は `npm run test` も実行する。CI 整備フェーズで上記 3 点(`npm run check` / `npm run build` / `npm run test`)を自動化する。

## 3. エラーハンドリング

- 例外は **throw 基本**。`Result<T, E>` 型は使わない(言語標準の流儀に揃える)
- `catch` で**握り潰し禁止**。最低でも `logger.error` してから再 throw、または明示的にハンドリング理由をコメント
- 再 throw は必ず原因チェーンを残す: `throw new MyError("msg", { cause: e })`
- 例外 message は英語、secret / PII / ユーザーの音声認識結果全文を不用意に含めない

**Why**: `try { ... } catch {}` が一箇所でもあると debug の時間が指数的に増える。原因チェーン欠落も同様。

**How to apply**: catch 節を書いたら必ずログ + 再 throw か、ハンドル理由のコメントを残す。

## 4. ログ / `console`

- `console.log` / `console.error` 直書き禁止。全体で用いるLoggerを用意し、それを経由する。

- ログレベル指針:

| level   | 用途                                                                                   |
| ------- | -------------------------------------------------------------------------------------- |
| `error` | 復旧不能 / ユーザー操作や接続継続に影響するもの                                        |
| `warn`  | 自動復旧した異常、fallback、retry 後 success、ブラウザ差分による機能縮退               |
| `info`  | WebRTC 接続状態、デバイス選択、VRM / MediaPipe / HLS などの初期化開始・終了            |
| `debug` | SDP / ICE / DataChannel / VAD / gaze / motion など、開発時の原因調査に必要な中間データ |

### 4.1 debug ダンプ方針

ブラウザ上の WebRTC / MediaPipe / 3D 描画は、環境依存の失敗が多い。開発時は再現に必要な診断情報を `debug` で出してよいが、常時出すとブラウザ console がノイズ化し、実ユーザー環境では privacy risk も上がる。

- `debug` レベルでは、SDP / ICE 候補の種別集計、DataChannel payload の schema 検証結果、VAD や face/pose tracking の数値を出してよい
- 音声認識結果、チャット本文、デバイス label など、個人情報や secret になり得る値は必要最小限にする
- ログファイル / trace 出力(`*.log`等)は `.gitignore` で除外。リポジトリに raw diagnostic data を commit しない

### 4.2 PoC でも常時禁止

- **secret(API key / Dify token / TURN credential など)は生のままログに出さない**

### 4.3 ログ形式

- 構造化ログを既定 — `logger.info("rtc connection failed", { state, iceConnectionState })`。文字列補間で詰め込まない

**Why**: WebRTC / MediaPipe / 3D 描画の debug は、ブラウザ・デバイス・ネットワーク状態を後から追えることが生命線。一方、secret と PII は開発中でも解禁し得ないため、診断ログとは別軸の絶対禁止として分離する。

## 5. テスト

- ランナーは `npm run test` から呼び出す。実体の test runner は導入時に決める
- 配置は対象コードと同階層の `__tests__/`(例: `RTC/__tests__/RTCTalkClient.test.ts`)
- ファイル名: `<対象>.test.ts`
- フィクスチャは `__tests__/fixtures/` に置く。プロダクションコードから import しない
- テストのためだけに internal を `export` しない — 必要な時点で純粋関数や境界処理を別ファイル化する

**Why**: PoC ではテスト網羅率より、「壊れたら気付ける場所」を堅く守るほうが debug コストを下げる。

## 6. import パス

- **path alias を使わない**。`tsconfig.json` の `paths` 未設定を維持し、相対 import を基本とする
- 同一ディレクトリは `./foo`、跨る場合は `../bar/foo`。`../../../` が 3 段を超えたら**配置を見直すサイン**
- type-only は `import type { X } from "./y"` または `import { type X } from "./y"` で分離(本書 §1 参照)
- import の並び順は **Biome `organizeImports` に従う**(`npm run check` で自動整列)。手で並び替える必要はない。デフォルトの順序は概ね「runtime 組み込み → 外部依存 → 相対 import」

**Why**: alias は移設時の負債(リネーム / 移動で alias 設定も追従が必要)になりやすい。相対パスは「物理位置 = 依存方向」が一目で見え、debug 時の追跡が容易。

## 7. `null` / `undefined` / Zod optional

- **アプリ内では `null` を使わない**。欠損は `undefined` で統一
- 例外: DB / 外部 API が `null` を返す境界のみ。境界で `?? undefined` 変換し、以後は `undefined`
- Zod は `.optional()` を既定。`.nullable()` は外部 I/O schema(DB / 外部 API) のみ
- 既定値は `value ?? defaultValue` を使う。`value || defaultValue`(falsy 全般を拾う)は禁止 — `0` / `""` / `false` が事故になる

**Why**: `null` と `undefined` を混在させると「どちらで欠損を表すか」を毎回局所判断することになり、debug 時に分岐網羅が困難になる。

## 8. 日付 / タイムゾーン

- **保存・契約 (Zod / DB / ログ) は UTC ISO8601 文字列** (`new Date().toISOString()`) で扱う
- **表示用(画面 / レポート / CLI 出力)のみ JST に変換**
- `Date` オブジェクトを contracts に持たせない — 文字列で持ち、必要箇所で `new Date(s)` する
- 日付ライブラリは当面追加しない(`Date` + ISO 文字列で十分)。差分計算等が増えたら `Temporal` の導入を再検討

**Why**: 「TZ 違いで再現しない bug」は debug が最も困難な種類のひとつ。境界で文字列に固定するのが最も負債を作らない。

## 9. TODO / FIXME / `@deprecated`

- 形式: `// TODO(task-<id>-<slug>): <内容>` — canonical task ID 紐付け必須。旧 `TODO(TASK-yymmddhhmmss): ...` は移行互換として許容する。ID 無しの TODO はレビューで差し戻し
- `FIXME` は使わない(`TODO` に統一)
- `@deprecated` を付けたら **同タスク or 次タスクで削除**。残置禁止
- コメントに「あとで」「いずれ」だけ書くのは禁止 — 必ずタスク化する

**Why**: 紐付かない TODO は数ヶ月で誰も追えなくなる。`@deprecated` 残置は「使われていない死んだコード」を増殖させる。

## 10. 環境変数

- 全 env var は env.ts に集約。Zod でスキーマ定義 + parse
- コード本体で `process.env.X` / `Bun.env.X` / `import.meta.env.X` を直参照することは**禁止**
- 新規 env var を追加したら同コミットで `examples/compose.env` やフロントエンド用 env サンプルを同期(値はダミー or プレースホルダ)
- env の読み込み方法は runtime に合わせる。Vite は `import.meta.env`、Bun 採用時は Bun の auto-load を env.ts の内側だけで扱う
- secret 系(API key 等)はログに出さない。`.env` 本体は絶対に commit しない(AGENTS.md と整合)

**Why**: env 直書きは「どこで何を読んでいるか」が grep でしか分からず、deploy 時の差し替え漏れ温床になる。

## 11. 言語ポリシー

| 対象                         | 言語                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| identifier(変数 / 関数 / 型) | 英語                                                                                                    |
| ログ / Error message         | 英語(運用 / 検索しやすさ)                                                                               |
| ソースコード内コメント       | 日本語(AGENTS.md と整合)                                                                                |
| Markdown 文書                | 日本語。[coding-md.md](coding-md.md) を正本とする                                                       |
| ユーザー向け文言             | 日本語                                                                                                  |
| Zod schema の `.describe()`  | 日本語または英語。ユーザー表示用は日本語、開発者向け診断は英語でも可                                    |
| コミットメッセージ           | 日本語。形式は [tasks/README.md](../../tasks/README.md) の Conventional Commits ベース規約を正本とする. |

## 12. その他の負債抑制ルール

- **マジックリテラルの定数化** — モデル名 / タイムアウト / しきい値は `UPPER_SNAKE` 定数に `as const` で集約
- **一時的なフラグを controller / service / manager の引数に増やさない** — UI state / 設定 model / env 経由で渡す(引数増殖は責務境界の崩れの起点)
- **コメントアウトでの「とりあえず無効化」禁止** — 不要コードは削除する(git history が正本)
- **型 / Zod schema は境界ごとに正本を 1 箇所**。同型を別ファイルで再定義しない
- **「将来の差し替えのため」の抽象を作らない** — 必要になった時点で抽出する(Rule of Three 手前で動く / AGENTS.md と整合)

## 13. ソースコードコメント品質

コメント品質の目的、既存コードへの適用、省略条件、audit schema は [source-comments.md](source-comments.md) を
正本とする。TypeScript でも、公開 API や非自明な制約は必須の下限であり、それだけで十分とは判断しない。
処理の全体像、pipeline の段階、state transition、data transformation、離れた component / hook / Worker 間の
関係を、一般的な開発者が短時間で調査できるようにする。

コメント作業はコメント数を増やす作業ではない。変更した symbol / block / decision / flow と
change comprehension surface を `keep` / `rewrite` / `delete` / `add` に分類し、安全な変更と理解支援の両方に
必要な reader knowledge を残す audit として扱う。

コメントで責務分割を代替しない。[code-structure.md](code-structure.md) の「コメントで段落分けしたくなったら
関数抽出を検討する」方針に従い、まず命名、関数分割、型定義、options object で明確化できないか確認する。

### 13.1 コメントが必須の対象と audit 単位

comment audit の最小単位は file ではなく、対象 symbol / block / decision / flow である。次の対象は個別に
audit する。

- `export` される、または public な class / function / type / interface / component / hook / module /
  domain-significant `const`
- `schemaVersion` を持つ保存 contract、replay log、debug snapshot、parser
- Worker / DOM / MediaStream / MediaPipe / WebRTC / filesystem / replay log などの境界 module
- coordinate system、単位、左右定義、時刻基準、frame index、confidence / reliability の意味
- threshold、fallback、degradation、recovery、cooldown、hysteresis、clamp、side assignment、ROI 判定などの
  heuristic
- cleanup 所有者、resource lifecycle、例外を fallback に落とす理由
- app controller、conversation、tracking、animation など複数段階を調停する orchestration
- state / mode transition、event / callback の発生元と、後続処理を開始する条件
- raw browser / MediaPipe / WebRTC data から内部表現への変換と、後段へ委ねる処理
- 名前と型だけでは上位 flow における役割が分からない private function / block

audit artifact の列と省略理由は [source-comments.md](source-comments.md) の「Comment audit」を使う。
file 単位の「module comment に集約」だけでは完了扱いにしない。

### 13.2 記法の使い分け

- export / public API のコメントは原則 JSDoc / TSDoc とする。生成ドキュメントが無い場合でも、
  editor hover とレビューで契約を読める形にする。
- 実装内部の flow / navigation / state / data の補足は通常の block comment または line comment を使う。
  複数行を一段高い抽象度で要約し、現在の処理段階や前後関係を示すコメントを許容する。
- ソースコード内コメントの言語は §11 に従い日本語とする。Error message やログの英語方針は変えない。

例:

```ts
/**
 * replay log v2 の gaze sample を runtime で扱う正規化形式へ変換する。
 *
 * v1 log は `confidence` を持たないため `undefined` として受理する。
 * frame index が単調増加でない sample は、再生順序の復元に失敗するため reject する。
 *
 * @throws ReplayLogParseError 受理できない version または frame index の場合。
 */
export function parseGazeReplaySample(input: unknown): GazeReplaySample {
  ...
}
```

### 13.3 最低限含める内容

対象別に、コメントへ次の情報を含める。

| 対象                | 最低限書く内容                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| public export       | 責務、入力境界、返す値または observable output の意味、失敗条件、副作用、非対象                    |
| 境界 module         | 外部仕様、受け取る raw 値、正規化後の contract、失敗時の扱い、cleanup 所有者                       |
| schema / parser     | 受理する旧 log / version、reject する値、fallback 方針、caller に返る失敗の形、破壊的変更の確認先  |
| coordinate / 単位   | 座標系、単位、左右定義、時刻基準、frame index の基準、confidence の意味                            |
| threshold           | 値の意味、採用理由または由来、変更時に確認する表示・テスト、誤調整した場合の見え方または失敗モード |
| heuristic           | 入力前提、値の意味、採用理由、変更時の確認先、誤調整した場合の見え方または失敗モード               |
| lifecycle / cleanup | resource の所有者、解放タイミング、解放順序、二重解放やリークを避けるための不変条件                |
| fallback / 例外処理 | 例外を握り潰さず fallback に落とす理由、ユーザー影響、ログや復旧の観測点                           |

### 13.4 省略と module TSDoc への集約

コメントの省略条件は [source-comments.md](source-comments.md) の「コメントの省略条件」を正本とする。
private であること、短いこと、型があること、既存コードにコメントがないことは単独の省略理由にならない。
目的、上位 flow での位置、入出力、state change、前後関係が局所的に読める場合だけ省略できる。

module TSDoc へ個別 export の保守知識を集約できるのは、file 内の public export が単一責務を共有し、module
comment が各 export の入力境界、observable output、失敗条件、副作用、非対象を具体的に覆う場合に限る。
単なる file の責務要約、設計文書への誘導、または「各 export は module comment を参照」といった宣言だけでは
集約条件を満たさない。

### 13.5 必要な実装コメント

TypeScript の実装内部では、次の対象に block / line comment を置く。コードと同じ粒度の逐語説明ではなく、
複数行・複数 symbol の関係を一段高い抽象度で説明する。

- 複雑な分岐やアルゴリズムの不変条件
- workaround と、その外部要因または削除条件
- 性能上の理由
- ブラウザ、MediaPipe、WebRTC、VRM など外部仕様由来の制約
- cleanup / lifecycle / fallback の安全条件
- orchestration / pipeline の現在段階と、この段階で完了させる責務
- state / mode transition と event / callback の発生元
- 座標、frame、payload、browser API value などの変換前後
- component、hook、Worker、controller、service 間の非局所的な接続関係
- 意図的な早期 return、no-op、処理の延期、後段へ委ねる責務

`catch` で fallback へ落とす場合は §3 に従い、ログ + 再 throw か、明示的なハンドル理由をコメントで残す。
TODO は §9 の形式に従い、canonical task ID と削除条件を持たせる。

### 13.6 禁止するコメント

- `// 値を返す`、`// ループする` のような処理説明だけのコメント
- public API と非自明な制約だけを機械的に埋め、内部 flow の理解困難を放置すること
- 古い実装経緯だけを残し、現在の判断や契約を説明しないコメント
- 「design doc / focused tests を確認する」とだけ書き、実コード上の入力境界、失敗条件、副作用、確認観点を
  説明しないコメント
- 名前や型から分かる責務要約だけのコメント
- heuristic / threshold の存在だけを書き、誤調整時の見え方や失敗モード、値の由来を説明しないコメント
- audit artifact で `public export のため追加`、`既存コメントで十分` のような定型文だけを書き、
  symbol / decision 固有の reader question と required reader knowledge を示さない理由
- `private`、`短い`、`型がある`、`既存コードにもない` だけを省略理由にすること
- 根拠のない `temporary`、`workaround`、`magic`
- 理由、削除条件、canonical task / issue ID、期限または判断基準がない TODO
- 実装と同期しない設計メモ、更新されず stale になったコメント
- コメントアウトしたコードの残置。不要コードは削除し、必要な判断は task または ADR に残す
