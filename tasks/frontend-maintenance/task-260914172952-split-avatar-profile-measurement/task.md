# アバタープロファイルの計測と値の組み立てを分ける

## 背景・目的

保存検証の分離後も、ボーン走査・寸法計測・既定値生成・最小表現への変換が生成側に残る。Three.jsを使う計測部分と純粋な値の組み立てを分ける。

元候補: `work/frontend-refacter.md` の番号8。優先度: 中。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] Three.jsのボーン参照・計測と、プロファイル値の組み立て・変換の責務が区別できる。
- [x] 欠損ボーン、計測不能値、警告順序、既定値と最小プロファイルへの変換結果が同じである。

## 変更範囲・方針

- `collectBoneNodes`、`createRestLocalRotation`、`createMetrics`と専用の距離・寸法計測を、Three.js依存を持つ計測モジュールへ移す。
- 生成関数は計測結果からプロファイルを組み立てる役割に限定し、`cloneAvatarMotionProfile`と`toMinimalAvatarMotionProfile`は先行タスクで分けたデータ処理の所有箇所へ整理する。関数ごとの細分化はしない。

対象外: 骨格計測の精度改善、値の再較正、手動複製を`structuredClone`へ変更する最適化。

主な参照元・変更箇所:

- [avatarMotionProfile.ts](../../../sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts)
- [minimalAvatarMotionProfile.ts](../../../sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts)
- [avatarMotionProfile.test.ts](../../../sincromisor-frontend/src/character/avatarProfile/__tests__/avatarMotionProfile.test.ts)

## 依存関係

- [アバタープロファイルの保存データ検証を分離する](../task-260914172952-split-avatar-profile-schema/task.md) の完了後に着手する。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/character/avatarProfile/__tests__/avatarMotionProfile.test.ts`
- 生成・複製・最小変換の利用元をrgで確認し、型確認でimportの追従を確認する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [overview.md](../../../documents/design/frontend/character/overview.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

- `avatarMotionProfileMeasurement.ts`へボーン参照・寸法・初期回転の計測を移した。`createAvatarMotionProfile()`は計測結果を受け取る純粋な組み立て関数とし、本番利用元の`SincroPoseRetargeter.attachVrm()`を計測→組み立てへ追従した。
- `toMinimalAvatarMotionProfile()`は既存の`avatarMotionProfileClone.ts`へ移し、生成・複製・最小変換の利用元を検索してimportを更新した。計測式、欠損処理、既定値、警告順序と保存形式は維持した。
- 指定テスト8件、変更ファイルのBiome、型確認を含む本番ビルドが成功した。非有限値のテストを警告配列の完全一致へ強化した際、回転異常が位置計測にも伝わるとした期待値を実コードに照らして修正し、再実行した。
- キャラクター概要とコメントを同期し、生成ファイルの構造例外を削除した。コメント点検: PASS。ブラウザー確認は実施していない。既知の残リスクはない。
