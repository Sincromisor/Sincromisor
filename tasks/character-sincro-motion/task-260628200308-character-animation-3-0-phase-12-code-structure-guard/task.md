# character animation 3.0 phase 12 code structure guard

## 背景 / 目的

Phase 12 時点の sincromisor-frontend では、motion pipeline 周辺に 300 行を大きく超える TypeScript ファイルが増えている。`documents/rules/code-structure.md:11` はファイル 300 行を hard threshold としており、`documents/rules/code-structure.md:24` は UI 更新 / 外部 I/O / 純粋計算 / 状態管理 / schema validation の混在を分割条件としている。

現状では `motionMetrics.ts`、`motionDebugApp.ts`、`trackerRuntime.ts`、`motionIntentEstimator.ts` などがこの threshold を大幅に超えている。既存巨大ファイルは段階的に分割する必要があるが、先に「新規・変更でさらに肥大化しない」確認を task tooling に入れる。

## 完了条件（受け入れ条件）

- [ ] ルートの `scripts/tasks/checkFrontendStructure.mjs` を追加し、`sincromisor-frontend/src/**/*.ts` と `sincromisor-frontend/src/**/*.tsx` の行数を検査する。
- [ ] 検査対象から `**/__tests__/**`、`*.test.ts`、`*.test.tsx`、`sincromisor-frontend/src/**/*.d.ts` を除外する。CSS / Markdown / HTML は本タスクでは対象外にする。
- [ ] script は `git diff main --name-only -- sincromisor-frontend/src` で変更ファイルを取得し、存在する `.ts` / `.tsx` だけを strict 対象にする。`main` が取得できない場合は fail せず、全対象ファイルを inventory 対象として走査し、strict 対象は空にする。
- [ ] strict 対象ファイルで物理行数が 300 行を超える場合は exit code 1 にする。ただし、同じファイルに `// reason: structure-threshold-exception <理由>` が含まれる場合だけ warning 扱いにする。
- [ ] 全対象ファイルで 300 行超の inventory を標準出力に `lineCount path` の昇順で出す。inventory は既存巨大ファイルを失敗扱いにしない。
- [ ] `package.json` に `tasks:check:frontend-structure` を追加し、`tasks:check` とは別に単独実行できるようにする。既存 `tasks:check` の挙動は変えない。
- [ ] `tasks/README.md` のスクリプト表に `npm run tasks:check:frontend-structure` を追加し、既存巨大ファイルは inventory、変更ファイルは strict gate であることを書く。
- [ ] `documents/rules/code-structure.md` に frontend structure guard の運用を追記し、例外コメントは `// reason: structure-threshold-exception <理由>` に固定する。
- [ ] 追加 script は Node.js 標準 API だけで実装する。新規 npm dependency は追加しない。
- [ ] 出力順は決定的にし、同じ入力に対して同じ順序・同じ exit code になる。

## 設計判断（着手前に確定済み）

- gate は Biome rule ではなく `scripts/tasks/checkFrontendStructure.mjs` に置く。Biome では「変更ファイルだけ strict、既存巨大ファイルは inventory」という移行用の判定を素直に表現しにくいため。
- 物理行数を採用する。`documents/rules/code-structure.md` の表では import / コメント / 空行を除くとあるが、初回 guard は簡単で決定的な悪化防止を優先し、除外行の精密集計は後続改善に残す。
- strict 対象は `git diff main --name-only -- sincromisor-frontend/src` に固定する。working tree の全巨大ファイルを即 fail にすると既存負債の段階的分割を阻害するため。
- 例外はファイル内コメントに固定する。別 baseline JSON を持つ案は、baseline 更新自体が負債化しやすく、例外理由がコード近傍から読めないため採用しない。
- 外部境界は git コマンドと filesystem だけである。network、LLM、DB、外部 API は使わない。git diff 失敗時は fail せず inventory だけを出す。

## スコープ境界

- 本タスクでやること:
    - frontend TS/TSX ファイルサイズの悪化防止 script。
    - package script 追加。
    - task / code-structure 文書への運用追記。
- 本タスクでやらないこと:
    - 既存巨大ファイルの分割。
    - 関数長、引数数、ネスト深さの機械検査。
    - CSS / Markdown / Python の構造検査。
    - CI workflow への接続。
- 依存タスクとの境界:
    - 後続の module split タスクはこの guard を前提にしてよいが、このタスクは各巨大ファイルの中身を変更しない。

## 実装方針（既存コード整合: file:line）

- task tooling の npm script はルート `package.json` に集約されている（`package.json:7`、`package.json:12`）。新 script はこの並びに追加する。
- task script は `scripts/tasks/*.mjs` に Node.js で置かれている（`scripts/tasks/newTask.mjs:5`、`scripts/tasks/checkTasks.mjs:155`）。新 script も同じ場所・同じ ESM 形式にする。
- `tasks/README.md` は scripts 表を持つ（`tasks/README.md:157`）。新 script の説明はここへ追加する。
- code structure のサイズ閾値は `documents/rules/code-structure.md:11` にあり、例外理由は `documents/rules/code-structure.md:51` で `// reason:` と定義されている。例外コメントの具体値はここへ追記する。
- 現在の代表的な巨大ファイルは `sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:149`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:65`、`sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts:785` に存在する。inventory はこれらを fail ではなく一覧化する。

## テスト

- `npm run tasks:check:frontend-structure`
- `npm run tasks:check`
- `npm run tasks:index:check`
- 可能なら一時的な fixture branch / temp file を使い、変更 TS ファイルが 301 行で exit code 1、例外コメントありで exit code 0 になることを確認する。fixture はコミットしない。

## ドキュメント同期の要否

要。公開 API / 通信契約は変えないが、開発運用と task tooling の確認項目が増えるため、`tasks/README.md` と `documents/rules/code-structure.md` を同期する。
