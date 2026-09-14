# 本番の姿勢合成サービスの名前と説明を整理する

## 背景・目的

`SincroVrmPoseComposerDryRunService`の結果は本番の最終姿勢へ適用されるが、名前と観測専用という説明が試行処理との誤解を招く。内部APIを本番の合成責務に合わせる。

元候補: `work/frontend-refacter.md` の番号2。優先度: 高。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 実装とテストが新しい合成サービス名を使い、本番適用されることを説明から判断できる。
- [x] 合成結果・状態判定・前回姿勢保持とresetの条件が同じであり、保存・診断・再生データの形が変わらない。

## 変更範囲・方針

- サービス・ファイル・入力結果型を`SincroVrmPoseComposerService`等の合成責務を表す名前へ変更し、全importと直接関連する説明を更新する。具体名は既存`VrmPoseComposer`と衝突しないものを実装者が選ぶ。
- 計算側はVRMへ書き込まず、適用側が最終姿勢を使う境界を説明する。`ObserveOnly`の状態推定、保存・診断キー`composerDryRun`、`schemaVersion`、警告コードは変更しない。

対象外: 保存形式の移行、`ObserveOnly`全体の一括改名、姿勢の適用条件変更、既存の切り戻しフック削除タスクの実装。

主な参照元・変更箇所:

- [sincroVrmPoseComposer.ts](../../../sincromisor-frontend/src/character/runtime/sincroVrmPoseComposer.ts)
- [sincroVrmPoseComposerSemanticFingerLayers.ts](../../../sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerSemanticFingerLayers.ts)
- [vrmCharacterManager.ts](../../../sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts)
- [sincroMotionPipelineState.ts](../../../sincromisor-frontend/src/character/runtime/sincroMotionPipelineState.ts)
- [debugConsoleSincroMotionRuntime.ts](../../../sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionRuntime.ts)

## 依存関係

- [VRM管理から最終姿勢の適用処理を分離する](../task-260914172950-extract-normalized-pose-writer/task.md) の完了後に着手する。

既存の[切り戻しフック削除](../../character-sincro-motion/task-260712044933-remove-semantic-finger-rollback-hook/task.md)は別目的であり、必須依存にしない。本タスクは着手時点で存在するフラグと抑制条件を維持し、先に削除済みなら復活させない。同じファイルの変更を並行実施しない。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/character/runtime/__tests__/sincroVrmPoseComposer.test.ts src/character/runtime/__tests__/sincroMotionPipelineState.test.ts src/character/vrmCharacter/__tests__/armBoneController.test.ts`（改名したテストは新パスを指定する）。
- 旧サービス・型・importの残存をrgで確認する。保存キーは意図して維持したものとして区別する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [overview.md](../../../documents/design/frontend/character/overview.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。
- [motion.md](../../../documents/design/frontend/character/motion.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実装・確認結果

- `sincroVrmPoseComposer.ts` / `SincroVrmPoseComposerService` と入力・結果・状態型へ改名し、実装・診断・比較指標・既存テストの参照を更新した。
- 管理側のサービス保持名と適用側の引数名を合成責務に合わせた。計算・状態判定・前回姿勢と指の保持・reset条件・切り戻しフラグは維持した。
- 保存・診断キー `composerDryRun`、状態推定の `ObserveOnly`、`schemaVersion`、警告コードと再生データの形は変更していない。
- 対象の3テストに比較指標・再生解析テストを加え、4ファイル27件が成功した。`npm --prefix sincromisor-frontend run build` の型確認と本番ビルドも成功した。
- 変更したTypeScriptのBiome確認、MarkdownのPrettier確認、旧サービス名・型名・importの残存確認が成功した。合成サービス本体は改名とコメントを除いた比較でも変更がないことを確認した。
- 設計の概要・動作文書を同期し、設計索引からの導線を確認した。コメント点検: PASS。
- `tasks:index:check` と `tasks:check` が成功した。既存の未コミット索引編集は保ち、コミットする索引には対象タスクの完了分だけを含めた。
- ブラウザー確認は未実施。動作を変えない内部改名のため、既存の合成・適用・再生テストで確認した。既知の残る問題はない。
