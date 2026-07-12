# タスク起票チェックリスト（task-reviewer 評価観点の正本）

このファイルは **起票するエージェントの自己点検項目** であり、同時に **`task-reviewer` の評価観点の
正本**でもある。両者が同一の基準を共有することで、初回 `NEEDS_REVISION` の往復を減らすのが狙い。

> 使い方（`/new-task` フロー）: タスク立案は「対話による調査・検討」で行い、`/new-task タイトルまたは要約`
> を呼ぶ。**対話文脈を持つそのセッション自身が**雛形（`npm run tasks:new`）を起こし、本チェックリストの
> 観点で `task.md` を記述する。続けて **レビュー専用サブエージェント（task-reviewer、独立セッション）** が
> `task.md` 単体を独立レビューし、`NEEDS_REVISION` なら起票したエージェントが改訂・再レビューする
> （reviewer は `task.md` を書き換えない）。APPROVED 済みを `/run-task` に渡す。
> ライフサイクルの位置づけは [README.md](./README.md) の「起票フロー」を参照。

各観点は task-reviewer が **NEEDS_REVISION 判定の根拠**にする。起票時に潰しておくほど初回で通る。

## 1. 要件の明確さ（受け入れ条件が曖昧・欠落していないか）

- [ ] 完了条件が **検証可能な形**で書かれている（「〜を改善する」ではなく「〜のとき〜を返す」）。
- [ ] 各完了条件の **期待値が一意**に定まる（複数解釈の余地・「いずれか」が残っていない）。
- [ ] 異常系・境界（空入力 / 欠損 / 上限超過など）の期待挙動が定義されている。

## 2. 設計判断を着手前に確定（最頻出の NEEDS_REVISION 根拠）

実装者に「どちらでもよい」を残さない。選択肢があるなら起票時に **1 つに決め切り、根拠を書く**。

- [ ] 新規に導入する型・モジュール・データ構造の **所在（ファイルパス）と最小スキーマ**を明示した。
- [ ] 既存 API / データ表現に複数の解釈余地がある箇所（フォーマット・識別方式・経路）を
      **どれを採るか**確定し、不採用案を退ける理由を 1 行添えた。
- [ ] 外部境界（ネットワーク / 外部 API / LLM / DB など）の入力検証・失敗時挙動の方針を示した。

## 3. 既存コードベースとの整合性（file:line で裏取り）

- [ ] 触る既存箇所を **`file:line` で参照**し、前提（行番号・シグネチャ・契約）が現状と一致することを確認した。
- [ ] 矛盾する前提・命名・依存がない（プロジェクトの規約・設計資料
      〔`AGENTS.md` / `README.md` / `documents/design/` / `documents/rules/` / `tasks/README.md`〕と整合）。
- [ ] 過去タスクから引きずった **陳腐化した前提**（存在しないファイル・廃止 API）が残っていない。

## 4. スコープと責務分界（過大・過小でないか）

- [ ] スコープが過大／過小でない（1 タスク = 追跡可能な 1 つの変更束）。
- [ ] 依存タスクがある場合、**本タスクの作業と依存タスクの責務の境界**を明示した
      （「この拡張は本タスクで足す / 依存タスクが残した余地に乗る」を曖昧にしない）。
- [ ] スコープ外（やらないこと）を列挙した。

## 5. テスト可能性

- [ ] 各受け入れ条件に対応する **検証方法**（プロジェクトの 3 点ゲート: lint / 型・ビルド / テスト。
      まとめて `npm run gate`）が書かれている。
- [ ] テストの **期待値が一意**（観点 1 と対）。終端・分岐の網羅が条件化されている。

## 6. ドキュメント同期の要否（High 指摘になりやすい）

公開 API / 通信契約 / 公開挙動を変えるタスクは、対応ドキュメント（API スキーマ / 利用例 / README /
設計資料など）の同期を **受け入れ条件として明記**する（lint / 型 / test で検出できない領域。漏れは
reviewer の High 指摘になりやすい）。

- [ ] 公開 API / 通信契約 / 公開挙動への影響を判定した。
- [ ] 同期が **要**なら、同期先ドキュメントを **具体名**で受け入れ条件に書いた。
- [ ] 同期が **不要**なら、その理由（内部クローズドな変更等）を 1 行書いた。
- [ ] 公開バレル / 生成物（型定義・ビルド成果物など）を変える場合、その再生成とコミットを方針に含めた。

## 7. ソースコードコメント品質（TypeScript production code）

TypeScript production code を変更するタスクは、[documents/rules/coding-ts.md](../documents/rules/coding-ts.md)
の「ソースコードコメント品質」に照らした comment audit / comment acceptance を `task.md` の受け入れ条件へ
含める。対象変更なのにコメント観点が無い場合、task-reviewer は受け入れ条件不足として指摘する。
コメント改善タスクでは file 単位の module TSDoc 集約や定型理由だけで完了できないよう、
symbol / decision 単位で対象と期待値を定義する。

- [ ] TypeScript production code 変更の有無を判定した（test / fixture / docs のみなら対象外理由を書いた）。
- [ ] public export / public component / hook / module、schemaVersion を持つ保存 contract、Worker /
      DOM / MediaStream / MediaPipe / WebRTC などの boundary、coordinate / threshold / fallback /
      cleanup などの heuristic / lifecycle、schema/parser を追加または変更するか確認した。
- [ ] 対象がある場合、`path`、`symbol or decision`、`kind`、`current comment`、`decision`
      （`keep` / `rewrite` / `delete` / `add`）、`required maintenance knowledge`、`action`、
      `reviewer note` を含む symbol / decision 単位の comment audit schema を受け入れ条件に含めた。
- [ ] 対象がある場合、JSDoc/TSDoc を含むコメント追加・更新だけでなく、弱い既存コメントの
      delete / rewrite 条件を受け入れ条件に含めた。
- [ ] public export の目的、契約、入力境界、返す値または observable output、失敗条件、副作用、
      非対象のうち、変更対象に必要な情報を task acceptance に定義した。
- [ ] module TSDoc へ集約できる条件（file 内の public export が単一責務を共有し、各 export の
      入力境界、observable output、失敗条件、副作用、非対象を具体的に覆う場合のみ）を定義し、
      file 単位の責務要約だけで完了できないことを明記した。
- [ ] コメントを省略する対象がある場合、省略理由を受け入れ条件または実装ログ記録条件に含めた。
- [ ] 対象がある場合、実装と矛盾する stale comment の削除・更新を受け入れ条件に含めた。
- [ ] TODO を追加または変更する場合、TODO 必須情報（理由、削除条件、canonical task/issue ID、
      期限または判断基準）を受け入れ条件に含めた。
- [ ] コメントで補う前に、命名、関数分割、型定義、options object で明確化できないかを確認する条件を含めた。
- [ ] コメント改善タスクが 10 file を超える広域一括作業を要求する場合、slice 分割または
      symbol-level sampling 方針を task.md に明記した。
- [ ] 評価時は変更された symbols / decisions の全件照合を原則とし、広域変更で全件照合が現実的でない
      場合でも固定件数だけで打ち切らず、public API、境界、heuristic / lifecycle、rewrite / delete 判断、
      定型 audit 理由の疑いがある箇所を優先したリスクベースの照合範囲、未照合範囲、残リスクを
      `eval.md` に記録する条件を含めた。
- [ ] 評価時の照合範囲で、名前・型から分かるだけのコメント、確認先だけのコメント、
      失敗モードのない heuristic コメント、定型 audit 理由があれば FAIL にする条件を含めた。
