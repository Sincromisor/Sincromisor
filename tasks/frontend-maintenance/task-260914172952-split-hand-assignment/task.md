# 手追跡の左右割当を専用モジュールへ分離する

## 背景・目的

`sincroHandTrackerHelpers.ts`に推論・正規化・特徴量・左右割当がまとまる。まず左右割当とその専用補助関数を独立させる。

元候補: `work/frontend-refacter.md` の番号9。優先度: 中。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 左右割当を推論呼び出し・座標復元と独立したファイルで確認できる。
- [x] 左右交差、同点、前フレーム情報、全画面代替、未検出時の結果と警告が変わらない。

## 変更範囲・方針

- `assignSincroHandObservationsToPose`、全画面代替での割当、候補順位・同点解決・前回側の参照・未検出生成を専用モジュールへ移す。
- 共有する観測型の所有を1箇所にし、推論・正規化と循環依存しないようにする。sourceや距離閾値、左右処理順は保持する。

対象外: 割当アルゴリズム変更、特徴量計算分割、手の左右判定の新ルール追加。

主な参照元・変更箇所:

- [sincroHandTrackerHelpers.ts](../../../sincromisor-frontend/src/features/gaze/handTracking/sincroHandTrackerHelpers.ts)
- [sincroHandTracker.ts](../../../sincromisor-frontend/src/features/gaze/handTracking/sincroHandTracker.ts)
- [sincroHandMotionSnapshot.test.ts](../../../sincromisor-frontend/src/features/gaze/handTracking/__tests__/sincroHandMotionSnapshot.test.ts)

## 依存関係

先行タスクなし。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/features/gaze/handTracking/__tests__/sincroHandMotionSnapshot.test.ts`
- 全利用元のimportをrgで確認し、既存の左右割当テストを新しい入口から実行する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [tracking.md](../../../documents/design/frontend/character/tracking.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

左右割当の入口を `sincroHandAssignment.ts`、全画面代替の候補選択を `sincroHandFullFrameAssignment.ts` へ分離した。観測型・距離条件・結果生成は `sincroHandAssignmentSnapshot.ts` で共有し、割当から推論・座標復元への依存を除いた。本番と再生側の直接利用元、設計、関連コメントを同期した。

- 新しい入口で左右交差、同点、前フレーム優先、両経路の重複拒否・未検出警告を含む9テストが成功した。
- 移動前後の全関数の処理本体一致を確認し、変更ファイルのBiomeと型確認を含むビルドが成功した。
- 推論・正規化・特徴量が残る既存補助ファイルは後続タスクの範囲として構造例外に解消先を明記した。割当アルゴリズムと保存・通信形式は変更していない。
