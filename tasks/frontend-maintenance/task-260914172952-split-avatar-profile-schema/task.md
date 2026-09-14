# アバタープロファイルの保存データ検証を分離する

## 背景・目的

`avatarMotionProfile.ts`がThree.jsの計測と保存データのZod検証を同居させている。保存データ検証を独立して読めるようにする。

元候補: `work/frontend-refacter.md` の番号8。優先度: 中。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 保存データ検証がVRM計測の実行時モジュールを読み込まずに使える。
- [x] 保存形式、版、厳密なキー検証、数値範囲、エラー分類、入力非破壊と複製の挙動が同じである。

## 変更範囲・方針

- 保存スキーマ・`parseAvatarMotionProfile`・エラー分類を専用モジュールへ移す。型とボーン名・`schemaVersion`は型／契約用の小さなモジュールに1つだけ置き、生成側と検証側が参照する。
- パーサーが使う複製処理は純粋なデータ処理として循環依存なく共有する。新しい名前へのimport追従は直接利用元に限定し、スキーマからの型推論への全面移行はしない。

対象外: 計測式・数値補正・保存形式の変更、Zod更新、複製方式の変更。

主な参照元・変更箇所:

- [avatarMotionProfile.ts](../../../sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts)
- [minimalAvatarMotionProfile.ts](../../../sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts)
- [avatarMotionProfile.test.ts](../../../sincromisor-frontend/src/character/avatarProfile/__tests__/avatarMotionProfile.test.ts)

## 依存関係

先行タスクなし。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/character/avatarProfile/__tests__/avatarMotionProfile.test.ts`
- 保存ログ側の`parseAvatarMotionProfile`利用元をrgで確認し、影響があれば`motionDebugPhase7Snapshot.test.ts`も対象実行する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [overview.md](../../../documents/design/frontend/character/overview.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

保存スキーマ・解析・エラー分類を `avatarMotionProfileSchema.ts`、共有契約を `avatarMotionProfileTypes.ts`、共有複製を `avatarMotionProfileClone.ts` へ分離した。直接利用元を新しい入口へ接続し、保存検証からVRM計測への依存を除いた。設計と関連コメントも同期した。

- 既存プロファイル・保存ログ検証と独立読込確認の計12テスト、変更ファイルのBiome、型確認を含むビルドが成功した。
- スキーマ・解析・分類・複製の処理本体が変更前と同じことを比較し、入力非破壊もテストで確認した。
- 生成側の計測と値組み立ては後続タスクの範囲として残し、既存の構造例外を現在の責務と解消先に合わせて更新した。保存形式は変更していない。
