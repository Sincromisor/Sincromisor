# 手追跡の正規化と特徴量計算を整理する

## 背景・目的

左右割当分離後の`sincroHandTrackerHelpers.ts`には、モデル推論・時間計測、ROI座標復元・正規化、指の特徴量計算が残る。残る責務を具体的な名前で整理する。

元候補: `work/frontend-refacter.md` の番号9。優先度: 中。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 推論、正規化、特徴量計算の所属が名前から分かり、汎用Helpersに混在しない。
- [x] ROIの全画面座標復元、非有限座標の補正、曲げ・開き・親指・掌特徴量、推論時間とFPSの値が同じである。

## 変更範囲・方針

- ROI復元・生結果正規化と、掌・指の特徴量計算をそれぞれ責務名付きのモジュールへまとめる。`mapCropPointToFullFrame`を再利用する。
- 推論呼び出しと時間計測は追跡クラス内の非公開処理、または既存の推論責務に置く。補助型の再公開は必要な利用元だけへ絞り、空になったHelpersファイルは削除する。

対象外: 手特徴量や正規化のアルゴリズム変更、汎用数学ライブラリ追加、Worker側の推論方式変更。

主な参照元・変更箇所:

- [sincroHandTrackerHelpers.ts](../../../sincromisor-frontend/src/features/gaze/handTracking/sincroHandTrackerHelpers.ts)
- [sincroHandTracker.ts](../../../sincromisor-frontend/src/features/gaze/handTracking/sincroHandTracker.ts)
- [roiCoordinateMapping.ts](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/roiTracking/roiCoordinateMapping.ts)
- [sincroHandMotionSnapshot.test.ts](../../../sincromisor-frontend/src/features/gaze/handTracking/__tests__/sincroHandMotionSnapshot.test.ts)

## 依存関係

- [手追跡の左右割当を専用モジュールへ分離する](../task-260914172952-split-hand-assignment/task.md) の完了後に着手する。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/features/gaze/handTracking/__tests__/sincroHandMotionSnapshot.test.ts src/features/gaze/trackingRuntime/roiTracking/__tests__/roiCoordinateMapping.test.ts`
- `TrackerRuntime`からの手追跡呼び出しに影響した場合だけ`trackerRuntime.test.ts`を追加実行する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [tracking.md](../../../documents/design/frontend/character/tracking.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

- `sincroHandNormalization.ts`へROI座標復元・非有限値補正・生結果正規化、`sincroHandFeatures.ts`へ掌・指特徴量を移した。座標復元は`mapCropPointToFullFrame()`を再利用する。
- 推論呼び出しと時間計測、FPS計算は追跡クラスの非公開処理へ移し、不要な補助型の再公開と空になったHelpersを削除した。再生側も正規化モジュールを参照する。
- 指定2ファイルと呼び出し元の`trackerRuntime.test.ts`を合わせた28件、変更ファイルのBiome、型確認を含む本番ビルドが成功した。非有限座標、特徴量の値、推論時間・FPS・停止後の初回扱いを追加確認した。
- 追加テストのMediaPipe結果に不足した`handednesses`を補い、外積で生じる符号付きゼロの期待値を修正して再検証した。本番の計算式は変更していない。
- 追跡設計と参照を同期した。コメント点検: PASS。モデルと左右ROI・全画面推論を所有する追跡クラスには、更新順序を維持する構造例外を明記した。ブラウザー確認は実施していない。既知の残リスクはない。
