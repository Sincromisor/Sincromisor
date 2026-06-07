# コーディング規約(TypeScript)

> **Scope**: TypeScriptコードベース横断のコーディング規約(型運用 / エラー / ログ / テスト / import / null / 日付 / TODO / env / 言語)
> **AGENTS.md との関係**: [AGENTS.md](../../AGENTS.md) は初動ガイドと正本リンクを保持する。サイズ閾値 / 分割判断 / 主要アンチパターンは [code-structure.md](code-structure.md) を正本とし、本書は TypeScript 固有の横断ルールを保持する。

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

| 対象                          | 言語                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| identifier(変数 / 関数 / 型)  | 英語                                                                                                     |
| ログ / Error message          | 英語(運用 / 検索しやすさ)                                                                                |
| ソースコード内コメント        | 日本語(AGENTS.md と整合)                                                                                 |
| ドキュメント (`documents/**`) | 日本語                                                                                                   |
| ユーザー向け文言              | 日本語                                                                                                   |
| Zod schema の `.describe()`   | 日本語または英語。ユーザー表示用は日本語、開発者向け診断は英語でも可                                     |
| コミットメッセージ            | 日本語可。形式は [tasks/README.md](../../tasks/README.md) の Conventional Commits ベース規約を正本とする |

## 12. その他の負債抑制ルール

- **マジックリテラルの定数化** — モデル名 / タイムアウト / しきい値は `UPPER_SNAKE` 定数に `as const` で集約
- **一時的なフラグを controller / service / manager の引数に増やさない** — UI state / 設定 model / env 経由で渡す(引数増殖は責務境界の崩れの起点)
- **コメントアウトでの「とりあえず無効化」禁止** — 不要コードは削除する(git history が正本)
- **型 / Zod schema は境界ごとに正本を 1 箇所**。同型を別ファイルで再定義しない
- **「将来の差し替えのため」の抽象を作らない** — 必要になった時点で抽出する(Rule of Three 手前で動く / AGENTS.md と整合)
