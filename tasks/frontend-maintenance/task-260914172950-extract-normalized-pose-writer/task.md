# VRM管理から最終姿勢の適用処理を分離する

## 背景・目的

`VRMCharacterManager`にモデル読込と毎フレーム制御に加え、所有ボーン一覧、姿勢変換・検査・適用が同居する。最終姿勢を書き込む境界を単独で読めるモジュールにする。

元候補: `work/frontend-refacter.md` の番号4。優先度: 高。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 最終姿勢の検査・変換・書き込みをモデル読込と独立したファイルで確認できる。
- [x] 利用可能な現在フレームだけ1回`setNormalizedPose`を呼び、欠損ボーン補完・利用不可理由・古い結果を再適用しない挙動を維持する。

## 変更範囲・方針

- `applyFullNormalizedPoseApplication`、結果型、所有ボーン一覧、`toVrmPose`と専用検査・変換関数を`vrmCharacter`配下の責務名付きモジュールへ移す。
- 管理クラスには適用の呼び出し順序を残す。診断の注釈付与は適用結果を受け取る側に保持し、テストのimportを新しい境界へ更新する。

対象外: モデル読込の再設計、所有ボーン変更、診断通知の配線変更、合成アルゴリズムの変更。

主な参照元・変更箇所:

- [vrmCharacterManager.ts](../../../sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts)
- [armBoneController.test.ts](../../../sincromisor-frontend/src/character/vrmCharacter/__tests__/armBoneController.test.ts)

## 依存関係

- [未使用の上半身直接制御を削除して腰の安定化を残す](../task-260914172950-remove-unused-torso-writer/task.md) の完了後に着手する。

既存の[切り戻しフック削除](../../character-sincro-motion/task-260712044933-remove-semantic-finger-rollback-hook/task.md)は別目的であり、必須依存にしない。本タスクは着手時点で存在するフラグと抑制条件を維持し、先に削除済みなら復活させない。同じファイルの変更を並行実施しない。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/character/vrmCharacter/__tests__/armBoneController.test.ts`
- 適用呼び出しが1箇所であり、旧直接制御が復活していないことをrgと差分で確認する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [overview.md](../../../documents/design/frontend/character/overview.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

- `normalizedPoseWriter.ts`へ結果型、所有ボーン、検査・変換・適用を移し、管理側の呼び出し順序と診断注釈を維持した。
- 指定テスト7件、変更したTypeScriptのBiome、型確認を含む本番ビルドが成功した。差分と検索で一括適用の本番呼び出しが1箇所であることを確認した。
- キャラクター概要と参照を同期した。コメント点検: PASS。
- 管理クラスの読込・初期化と診断通知は既存の後続タスクへ残し、構造例外の解消先を更新した。ブラウザー確認は実施していない。既知の残リスクはない。
