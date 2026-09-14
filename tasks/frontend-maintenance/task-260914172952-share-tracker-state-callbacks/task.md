# 追跡経路の共通状態更新コールバックをまとめる

## 背景・目的

`TrackerRuntime`の2つの入力組み立て処理で、推論時刻更新と最新Pose更新のコールバックを重複定義している。状態更新の同じ受け渡しだけをまとめ、接続コードを減らす。

元候補: `work/frontend-refacter.md` の番号7。優先度: 中。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 5種の同じ状態更新のコールバック生成が1箇所になり、2経路へ同じ形で渡される。
- [x] 推論時刻・最新Pose・再開始後の状態更新が変わらず、Workerと同期推論それぞれの実行順序を維持する。

## 変更範囲・方針

- `markPoseInference`、`markHandInference`、`markGestureInference`、`markFaceRoiInference`、`setLatestPoseSnapshot`の生成を共通化する。各推論処理の既存入力形を維持できる非公開生成関数を最初に検討する。
- 共通関数は呼び出された時点のthis.stateを更新し、start／stopで置き換わる古い状態オブジェクトを固定参照しない。性能判定・統計・ループ予約・失敗処理は今回まとめない。

対象外: Workerとメインスレッドの統合、性能制御の変更、開始世代やキャンセル機構追加。

主な参照元・変更箇所:

- [trackerRuntime.ts](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts)
- [trackerRuntimeTypes.ts](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts)
- [trackerRuntimeMainThreadPipeline.ts](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeMainThreadPipeline.ts)
- [trackerRuntimeWorkerPipeline.ts](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeWorkerPipeline.ts)

## 依存関係

- [追跡のジェスチャー省略通知を共通化する](../task-260914172952-share-skipped-gesture-notification/task.md) の完了後に着手する。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/features/gaze/trackingRuntime/__tests__/trackerRuntime.test.ts src/features/gaze/trackingRuntime/__tests__/trackerRuntimeCadence.test.ts`
- 共通化後に状態を置き換えた場合の更新先を1件確認する。未再現の開始・停止競合の修正には広げない。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

公開挙動と責務の上位境界は変えないため、設計文書の新設は不要。移動・削除したシンボルやパスへの既存参照があれば、その参照だけ更新する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

- 非公開の`createStateUpdateCallbacks()`で5種の更新口を生成し、Workerと同期推論の入力へ渡した。各経路の実行順序、性能判定、統計、ループ予約、失敗処理は維持した。
- 状態置換前に作ったコールバックを停止後に呼び、古い状態を変更せず現在の状態の4種の時刻と最新Poseを更新・解除できる回帰テストを追加した。
- 指定テスト2ファイル11件、変更ファイルのBiome、`tsc -p sincromisor-frontend/tsconfig.modern.json`が成功した。検索と差分で5種の生成が1箇所、利用が2経路であることを確認した。
- 公開挙動・上位責務・既存パスは変わらず、設計同期は不要。コメント点検: PASS。既知の残リスクはない。
