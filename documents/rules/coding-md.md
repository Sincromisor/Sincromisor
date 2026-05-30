# コーディング規約(Markdown)

> **Scope**: Markdown 文書横断の記述規約(構成 / 見出し / リンク / コードブロック / 表 / TODO / 言語 / フォーマット)
> **AGENTS.md との関係**: [AGENTS.md](../../AGENTS.md) は初動ガイドと正本リンクを保持する。タスク管理は [documents/tasks/README.md](../tasks/README.md)、コード構造は [code-structure.md](code-structure.md)、設計文書運用は [documents/design/documentation-guide.md](../design/documentation-guide.md) を正本とし、本書は Markdown 固有の横断ルールを保持する。

## 0. 設計思想

Markdown は「次に読む人と LLM エージェントが短時間で判断できる状態」を最優先する。

1. **現在有効な情報を読みやすく保つ** — 作業ログ、古い判断、未確定メモを現在仕様の本文へ混ぜない
2. **リンクで正本へ誘導する** — endpoint、payload、環境変数、運用手順などの正本を重複記載しない
3. **フォーマット差分を作らない** — 手整形に頼らず Prettier の出力を受け入れる

ルールは原則 hard。**破る場合は同じ箇条書きまたは直前行に `<!-- reason: <理由> -->` を付ける**(レビューでの差し戻し基準は理由の有無)。

## 1. ファイル配置 / 命名

| 対象                  | ルール                     |
| --------------------- | -------------------------- |
| Markdown ファイル名   | kebab-case                 |
| README                | `README.md` のみ例外       |
| タスクファイル        | `TASK-<yymmddhhmmss>-*.md` |
| ADR                   | `ADR-<YYMMDD>-<topic>.md`  |
| 一時メモ / 作業中メモ | `documents/tasks/` に置く  |
| 現在有効な設計 / 契約 | `documents/design/` に置く |

- snake_case / camelCase の `.md` ファイル名を新規追加しない。
- 設計文書の作成・更新・分割は [documents/design/documentation-guide.md](../design/documentation-guide.md) を正本とする。
- タスクは `documents/tasks/<大分類>/open/` に作成し、完了後に `done/` へ移動する。

**Why**: ファイル名と配置の規則が揺れると、LLM エージェントが `rg --files` で対象を絞りにくくなり、更新漏れの温床になる。

## 2. Lint / フォーマッタ / コミット前チェック

| 項目                    | ツール                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| フォーマッタ (Markdown) | **Prettier**(`*.md` のみスコープ)                                            |
| Prettier 設定           | [.prettierrc.json](../../.prettierrc.json)                                   |
| Prettier ignore         | [.prettierignore](../../.prettierignore)                                     |
| 実行 scripts            | [sincromisor-frontend/package.json](../../sincromisor-frontend/package.json) |

- Prettier は Markdown 専用として扱う。TypeScript / JavaScript / JSON は Biome、Python は Ruff に任せる。
- `.prettierrc.json` の `proseWrap: "preserve"` を前提に、本文の改行位置は書き手が意味単位で決める。
- 箇条書きやネストのインデントは Prettier の出力に従う。手で揃えるためのスペース調整をしない。
- コミット前の確認項目:
    1. `cd sincromisor-frontend && npm run check:md`
    2. TypeScript 変更を含む場合は `cd sincromisor-frontend && npm run check`

**Why**: Markdown は手整形の癖が差分に出やすい。Prettier の責務を Markdown に限定し、他言語の formatter と衝突させない。

## 3. 文書構成

- 冒頭の `#` 見出しは 1 つだけにする。
- 見出し階層を飛ばさない。`##` の下は `###`、`###` の下は `####` とする。
- 初見で読む文書には `目的` / `背景` / `スコープ` / `非対象` のいずれかを置き、何を判断する文書か明示する。
- 設計文書では、冒頭に `Summary` を置く運用を優先する。
- 1 文書は 120-200 行を目安にし、300 行を超える場合は分割を検討する。
- 変更履歴を本文へ積み上げない。重要な判断は ADR、作業ログはタスク文書へ移す。

**Why**: Markdown は自由に書ける分、現在仕様、背景、検証ログが混ざりやすい。見出しと置き場所を固定すると、読むべき範囲を短くできる。

## 4. 文章 / 言語

| 対象                          | 言語                           |
| ----------------------------- | ------------------------------ |
| `documents/**` の本文         | 日本語                         |
| 見出し                        | 日本語または既存文書に合わせる |
| コマンド / path / env var     | 原文のまま                     |
| endpoint / JSON key / channel | 契約名のまま                   |
| 外部ツール名 / ライブラリ名   | 公式表記                       |

- 文体は「です・ます」ではなく、既存文書に合わせて簡潔な常体を基本にする。
- 断定できない仕様を断定しない。未確認事項はタスク化するか、確認条件を明記する。
- 「あとで」「一旦」「たぶん」だけの記述は禁止。期限、条件、タスク ID のいずれかを添える。
- 同じ概念は同じ語で書く。例: `DataChannel` / `データチャネル` を同一文書内で揺らさない。

## 5. リンク / パス / 正本参照

- リポジトリ内リンクは相対リンクを使う。
- 同じ情報を複数文書にコピーしない。正本へのリンクと、読む理由を 1 行で書く。
- endpoint / payload / env var / compose 設定の詳細は、該当する `documents/design/contracts/` または `documents/design/infrastructure/` を参照する。
- 画像や大きな生成物へリンクする場合は、生成手順または更新条件を近くに書く。
- リンク切れを作らない。ファイル移動時は参照元を `rg` で確認する。

**Why**: 正本が分散すると、片方だけ更新されて実装判断を誤る。リンクは「重複の代替」として使う。

## 6. コードブロック / コマンド

- fenced code block を使い、可能な限り info string を付ける。
- shell コマンドは `sh` を使う。
- JSON / YAML / TOML / Python / TypeScript は該当する info string を付ける。
- コマンド例は、どのディレクトリで実行するか分かる形にする。
- secret、実トークン、個人情報、実ユーザー音声認識結果を例に書かない。
- 長いコードを Markdown に埋め込まない。実装ファイルを正本にし、文書からリンクする。

例:

```sh
cd sincromisor-frontend
npm run check:md
```

**Why**: コードブロックの言語指定があると、レビュー時にコマンドと設定値を読み分けやすい。長いコード転載は同期漏れの原因になる。

## 7. 表 / リスト

- 表は比較や一覧にだけ使う。長文説明を表へ押し込まない。
- 表の列は 4 列程度までを目安にする。横に長い場合は節を分ける。
- 箇条書きは 1 項目 1 主張にする。
- ネストは 3 段以内に抑える。深くなる場合は見出しを分ける。
- チェックリストはタスクや完了条件に使い、現在仕様の本文では多用しない。

## 8. 図 / Mermaid

- Mermaid は、文章より依存関係や流れが短く読める場合だけ使う。
- 図に仕様の正本を閉じ込めない。本文または契約文書から同じ情報へ辿れるようにする。
- 図を更新したら、近くの本文と矛盾していないか確認する。
- 複雑な図は文書分割や設計文書の責務分離を先に検討する。

## 9. TODO / コメントアウト

- TODO 形式: `TODO(TASK-yymmddhhmmss): <内容>`
- ID なし TODO は禁止。必要なら先にタスクを作る。
- Markdown comment で本文を隠して残さない。不要な記述は削除し、必要なら task done または ADR に残す。
- 未確定の検討メモを設計本文に置かない。`documents/tasks/` の open task に置く。

**Why**: Markdown の TODO は grep されにくく、放置されやすい。タスク ID と結び付けて追跡可能にする。

## 10. その他の負債抑制ルール

- **現在仕様と履歴を混ぜない** — 現在仕様は `documents/design/`、履歴は task done / ADR へ分離する。
- **巨大な README を作らない** — 入口として使い、詳細は責務別文書へリンクする。
- **設定値の一覧を手で複製しない** — 実装、compose、契約文書のどれが正本か明記する。
- **スクリーンショットだけで仕様を説明しない** — 画像は補助資料とし、判断に必要な仕様は本文へ書く。
- **外部 URL だけを正本にしない** — 外部仕様へ依存する場合は、参照日と本プロジェクトで採用する範囲を書く。
