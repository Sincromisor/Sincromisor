# 追跡のジェスチャー省略通知を共通化する

## 背景・目的

Workerとメインスレッドの推論処理に同じ`publishSkippedGestureSnapshot`がある。省略理由から同じ通知を作る処理だけを集約する。

元候補: `work/frontend-refacter.md` の番号7。優先度: 中。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 同一のジェスチャー省略通知の実装が1箇所になり、両経路が使用する。
- [x] 要求なしでは通知せず、要求ありでは既存reason・`trackingEnabled`・`mediaTimeMs`を保持する。

## 変更範囲・方針

- 既存の追跡省略通知と同じ領域へジェスチャー省略通知を置き、両経路から利用する。補助関数の入力はrequested・enabled・reason・timing・通知先に限定する。
- 通知の作成だけを集約し、どのフレームで省略を判断するかは各推論経路へ残す。

対象外: 推論頻度・ROI判定・機能低下・Worker通信・コールバック全体の再設計。

主な参照元・変更箇所:

- [trackerRuntimeWorkerPipeline.ts](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeWorkerPipeline.ts)
- [trackerRuntimeMainThreadPipeline.ts](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeMainThreadPipeline.ts)
- [trackerRuntimeRoiSnapshot.ts](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeRoiSnapshot.ts)

## 依存関係

先行タスクなし。

## 確認方法

- `npm --prefix sincromisor-frontend run test -- src/features/gaze/trackingRuntime/__tests__/trackerRuntime.test.ts`
- 既存テストに不足する場合だけ、要求なし／要求ありの通知内容を確認する小さなテストを加える。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

公開挙動と責務の上位境界は変えないため、設計文書の新設は不要。移動・削除したシンボルやパスへの既存参照があれば、その参照だけ更新する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

ジェスチャー省略通知を既存の追跡省略通知モジュールへ移し、Worker・メインスレッドの両方から利用する。省略判定は各推論経路に残し、共有関数の入力を通知に必要な値へ限定した。コメントと全呼び出し元を確認した。

既存6テストと追加1テスト、変更ファイルのBiome、型確認を含むビルドが成功した。要求なしで通知しないことと、要求ありで理由・有効状態・動画時刻が保持されることを確認した。既知の残リスクはない。
