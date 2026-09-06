# 動作指標の既定値と集計処理を整理する

## 背景 / 目的

ユーザーが求めた Biome の `noExcessiveCognitiveComplexity` 調査に基づく。resolveThresholds は28個のキーを手書きで重複列挙し、指標追加時の補完漏れを招く。回復角度と静止手首の集計は、入力選別と数値比較が多重ループに混在し、標本数と欠損時の挙動を追いにくい。

## 完了条件

- [x] キーの既定値補完を既存一覧に集約し、回復角度の対比較と静止手首の標本抽出を分離する。計算値、標本数、入力不足の理由、設定の欠損時補完を維持する。
- [x] 対象テスト、型検査、変更ファイルの Biome と Markdown 整形、タスク検査が成功する。

## 実装方針と範囲

対象はフロントエンドの motionMetricThresholds.ts、motionMetricRecoveryCalculators.ts、motionMetricTemporalCalculators.ts。`run-task` の通常変更として親が現在の作業ツリーで実装する。依存タスクはない。閾値変更や警告抑制は行わない。

## 確認方法

motionMetrics、temporalArmRecoveryFixture、既定値補完の回帰テスト。フロントエンドで `npx tsc -p tsconfig.modern.json --noEmit` と対象の `npx biome check` を実行する。

## 文書同期

内部処理の整理であり、公開契約と設計上の責務は維持するため設計文書の変更は不要。

## 調査結果

フロントエンドで `npx biome lint --only=complexity/noExcessiveCognitiveComplexity --reporter=json .` を実行し、20件を確認した。数値の上限超過だけを根拠にせず、変更時に追う条件の混在や重複を判断した。

| 対象                                                               | 判断と理由                                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveThresholds`（28）                                          | 本タスク。指標キーの重複列挙を既存一覧に集約する。                                                                                           |
| `calculateRecoveryJumpFromQuaternions`（19）                       | 本タスク。回復区間の選択と回転対の数値集計を分離する。                                                                                       |
| `calculateTemporalNeutralWristJitter`（20）                        | 本タスク。有効標本の選択と距離集計を分離する。                                                                                               |
| `aggregateSideFeatures`（34）                                      | [動作履歴タスク](../task-260906182704-sequence-complexity/task.md)。独立した前回値の混在を解消する。                                         |
| `parseMotionDebugLogLines`（33）                                   | [記録解析タスク](../task-260906182704-log-parser-complexity/task.md)。先頭行確定後の不要な状態分岐を除く。                                   |
| `VadProcessor.process`（19）、制御メッセージ（16）                 | [音声処理タスク](../task-260906182704-vad-complexity/task.md)。音声通過と発話検出の責務を分け、重複ガードを削除する。                        |
| `deriveVadSpeechTiming`（19）                                      | 維持。発話開始・保持・終了の一つの判定であり、重複する終了条件だけを別関数にしても読みやすさは改善しにくい。                                 |
| `HeadBoneController.update`（16）                                  | 維持。顔追従・視線・カメラ代替の優先順が直接読め、各動作は既に専用メソッドに分かれている。                                                   |
| `motionDebugRecorder.test.ts` の出力検証（23）                     | 維持。一つの記録の往復検証で、分岐は直前の成功確認に続く型の絞り込みが中心。                                                                 |
| `temporalArmRecoveryFixture.test.ts` の回復検証（18）              | 維持。生成記録の時間・状態・指標の一貫性確認であり、独立した本番処理の混在ではない。                                                         |
| `findNonJsonValue`（18）                                           | 維持。配列とオブジェクトの再帰検証で、最初の不正値の位置を返す単一の責務。                                                                   |
| `motionIntentEstimator.test.ts` の `createArm`（17）               | 維持。個々のテスト値の補完であり、既定値の意味も項目ごとに異なる。                                                                           |
| `updateHead`（16）                                                 | 維持。早期返却で状態ごとの優先順が明示され、回復・予測・中立化の計算は既に分離済み。                                                         |
| `buildStatusItems`（21）                                           | 維持。画面表示値と状態色の局所的な選択であり、表示順に追える。                                                                               |
| `createFullFrameCandidate`（18）、`selectObservationForSide`（17） | 維持。距離・重複・同点時の選択という一つの割り当て判断であり、順位付けと同点解決は既存関数に分離済み。                                       |
| `createWorldTargetPoint`（22）                                     | 維持。欠損座標の保持と正規化結果の組み立てで、座標ごとの条件付き値設定が中心。                                                               |
| `validateRoiRect`（18）                                            | 維持。有限値への補完、矩形切り詰め、最小寸法の確認という一方向の変換であり、状態の持ち越しはない。                                           |
| `executeRtcSignalingWithRetry`（23）                               | 維持。HTTP応答と通信例外の再送判断を一か所で追え、実リクエスト・待機・時間切れの処理は分離済み。今回の調査で具体的な不具合は確認していない。 |

## 確認結果

`run-task` の通常変更として実施。対象3ファイルと変更テストの Biome、TypeScript の型検査、指標・回復記録・既定値補完の3テストファイル23件が成功した。追加テストで回転差の欠損・同時刻・回復区間終端を確認した。文書点検とコメント点検は合格。ブラウザー実機確認は純粋な数値処理の整理のため対象外。
