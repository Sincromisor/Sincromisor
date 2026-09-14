# 未使用の上半身直接制御を削除して腰の安定化を残す

## 背景・目的

`CharacterMotionOrchestrator`の本番利用は腰の安定化と設定受け渡しに限られる一方、呼ばれないupdateと上半身直接書き込み用の状態が残る。現行の最終姿勢一括適用と混同する旧経路を取り除く。

元候補: `work/frontend-refacter.md` の番号1。優先度: 高。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 上半身の旧直接書き込み経路と専用状態が除去され、腰の位置・回転の復元は継続する。
- [x] 上半身一括適用、頭・脚・表情の更新順序と、欠損ボーン時の挙動が変わらない。

## 変更範囲・方針

- クラス・update・直接適用関数の全参照を再確認し、腰の復元に必要な処理だけを責務に合う名前で残す。
- 未使用の上半身更新、専用状態・設定転送、専用適用関数を削除する。共有定数・`characterMotionTorsoComposerLayer`・目の調整は維持する。

対象外: 旧演出の復活、切り戻しフラグ削除、合成レイヤーの調整、モデル読込の分割。

主な参照元・変更箇所:

- [characterRootStabilizer.ts](../../../sincromisor-frontend/src/character/vrmCharacter/characterRootStabilizer.ts)
- `characterMotionTorsoApplier.ts`（本タスクで削除）
- [vrmCharacterManager.ts](../../../sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts)
- [characterMotionBones.ts](../../../sincromisor-frontend/src/character/vrmCharacter/characterMotionBones.ts)

## 依存関係

先行タスクなし。

既存の[切り戻しフック削除](../../character-sincro-motion/task-260712044933-remove-semantic-finger-rollback-hook/task.md)は別目的であり、必須依存にしない。本タスクは着手時点で存在するフラグと抑制条件を維持し、先に削除済みなら復活させない。同じファイルの変更を並行実施しない。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/character/vrmCharacter/__tests__/armBoneController.test.ts src/character/vrmCharacter/__tests__/characterMotionTorsoComposerLayer.test.ts`
- 削除シンボルの実装参照が残らないことをrgで確認し、通常VRMの腰位置と上半身を短く確認する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [overview.md](../../../documents/design/frontend/character/overview.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。
- [motion.md](../../../documents/design/frontend/character/motion.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

腰の位置・初期回転の復元を `CharacterRootStabilizer` に限定し、旧上半身更新と専用状態・設定転送・一括ボーン収集を削除した。共有型、定数、体幹合成、目の調整と更新順序を維持し、設計・コメントを同期した。

- 対象3ファイルの11テスト、Biome、型確認を含むビルド、構造検査が成功した。削除シンボルの実装参照は残っていない。
- simple-vrmで標準VRMを通常描画し、腰位置・回転復元と上半身の有限値を確認した。RTCは接続していない。
- 管理クラスの既存の行数超過は最終姿勢適用分離タスクまでの例外として理由を明記した。
