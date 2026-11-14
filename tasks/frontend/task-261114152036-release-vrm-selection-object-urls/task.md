# VRM選択で生成したBlob URLの所有と解放を管理する

## 背景・目的

DialogVrmWorkflowServiceは保存前にBlob URLを生成するが、保存失敗時に解放しない。DialogStateStoreも選択URLを上書きするだけで旧URLを解放しない。2026-11-14の確認では成功2回・保存失敗1回でURL生成3件に対して解放0件だった。使用が終わったモデルのBlobを保持し続けないようにする。

## 完了条件

- [x] 選択側の単一所有者が、自分で生成したBlob URLの選択中・読込中の利用を追跡する。既定モデル等の外部URLは解放しない。
- [x] 保存失敗、不採用になった選択、選択の差し替えで不要となったURLを解放する。保存成功前のURL生成が不要なら保存後に移す。
- [x] シーンが読込中のURLは、選択が変わっただけでは解放しない。読込成功・失敗・取消しの終端で利用を終了し、選択側にも利用者にも不要になったURLを解放する。
- [x] 同じURLの二重解放を避け、旧選択の後着結果や初期復元の結果を不要に保持しない。
- [x] 現在の選択表示・Cache Storage保存形式を維持する。保存失敗時は現在の有効な選択を維持する。

## 設計判断・範囲

生成URLの所有をVRM選択処理へ集約し、シーン側は利用開始と終了だけを伝える。必要な内部窓口の具体名・実装方式は実装者が決める。URL解放はCache StorageのBlob削除でも、VRMのGPU資源解放でもない。サムネイル専用URLの既存管理は維持する。

[独立レビュー](review.md)の補完に従い、単一シーンの選択保持と進行中の読込利用を追跡する最小構成にする。汎用的な参照カウント基盤は追加しない。読込コールバック内の例外も利用終了通知へ通す。

[復元完了待ち](../task-261114152035-await-vrm-restore-before-start/task.md)の開始経路へ利用期間の通知を接続する。再選択モデルの表示反映自体は後続タスクとする。複数所有者の非同期な資源寿命を扱うため高リスク変更として独立レビュー・評価を行う。

## 主な変更箇所

- [VRM選択処理](../../../sincromisor-frontend/src/features/dialog/model/dialogVrmWorkflowService.ts)、[選択制御](../../../sincromisor-frontend/src/features/dialog/model/dialogVrmStateController.ts)、[状態](../../../sincromisor-frontend/src/features/dialog/model/dialogStateStore.ts)
- [モデル読込](../../../sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts)、シーン・初期化処理のURL受け渡し

## 確認方法

createObjectURL／revokeObjectURLの呼出しを観測し、保存成功・失敗、AからBへの選択変更、A読込中の変更、Aの成功・失敗、外部URLの各経路で解放時点を確認する。保存失敗後にURLが残らないことと、遅延した読込が途中の解放で失敗しないことを、本番の選択処理と読込境界をつないだ結合テストで確認する。実機の長時間メモリー測定は必須にしない。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の該当する責務・挙動を同期する。外部RTC契約は変更しない。

## 実装・確認結果

選択制御が保存・復元後のBlobからURLを生成し、現在選択と読込ごとの利用を保持する。選択から外れた所有URLは読込終端後に解放し、外部URL・二重解放を除外する。3ページのシーンから同じ保持窓口を使い、成功・失敗・取消し・コールバック例外の全終端で利用を終了する。保存形式は維持した。

選択処理と実モデル読込境界をつないだURL寿命の結合回帰12件、開始待ち・3ページ起動13件が成功した。全体検査で同セッションの先行変更に由来する説明部品のSSR参照と通知fixture不足を修正し、関連41件と全体Vitest144ファイル794件が成功した（既存2ファイル3件はスキップ）。型・ビルド・静的検査・文書整形・構造確認が成功した。[独立評価](eval.md)も実施した。コメント点検: PASS。

指定Node.js 26.12.1 / npm 11.21.1では未確認。既存Node.js 24.21.0 / npm 11.19.0で確認した。
