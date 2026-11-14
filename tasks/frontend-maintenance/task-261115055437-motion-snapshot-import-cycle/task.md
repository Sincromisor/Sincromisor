# 動作スナップショットの循環インポートを解消する

## 背景 / 目的

優先度: 中。[行動スナップショット](../../../sincromisor-frontend/src/character/behavior/characterBehaviorSnapshots.ts)は動作状態の複製関数を参照し、[動作状態](../../../sincromisor-frontend/src/character/runtime/sincroMotionPipelineState.ts)は顔スナップショットの複製・既定値生成を逆参照している。実行時の循環を切り、変更時に追う初期化順と依存範囲を減らす。現時点の実行障害を前提にしない。

## 変更範囲と方針

顔スナップショットの複製・既定値生成を両者より下位の専用モジュールへ移し、双方から参照する。[Poseの複製処理](../../../sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshotClone.ts)の配置を参考にする。関連する利用側だけ追従させ、不要な旧再公開を残さない。

顔の頭部行列について、既存の `cloneFaceMotionSnapshot` と `clonePipelineFaceMotionSnapshot` では複製の深さが異なる。今回の依存整理で同じ意味へ統合せず、時刻補完を含む戻り値と参照共有の契約を維持する。Pose、追跡器、動作計算の仕様変更は含めない。

## 完了条件

- [x] 上記2ファイル間の直接・間接の実行時循環がなくなる。
- [x] 既定値、時刻補完、警告・表情・領域・行列の複製範囲を維持する。
- [x] 型検査と影響する既存テストが通る。

## 確認方法

フロントエンドで型検査、変更ファイルのBiome、`src/character/runtime/__tests__/sincroMotionPipelineState.test.ts`、`src/character/behavior/__tests__/faceMorphController.test.ts`、`src/character/vrmCharacter/__tests__/armBoneController.test.ts` を実行する。変更した参照を追って循環解消を確認し、複製の意味が既存試験で確認できない場合だけ対象試験を補う。リポジトリ全体の依存監視基盤は追加しない。

## 文書同期

内部配置の整理で通信・保存・動作契約は変わらない。設計文書が移動対象を具体的に参照している場合だけリンクを更新する。

## 実施結果

顔の既定値生成と2種類の複製関数を `features/gaze/faceTracking/sincroFaceMotionSnapshotClone.ts`へ移し、利用側の参照を更新した。旧モジュールの再公開は残していない。行動表示用は頭部行列を共有し、パイプライン用は行列まで複製する契約をコメントと試験に明記した。

型検査、変更ファイルのBiome、指定された既存3ファイルと追加した顔複製試験の計16試験が成功した。既定値の独立性、時刻欠損の補完と0の保持、警告・表情・領域・行列の参照関係を確認した。型除去後の静的インポートを追跡し、対象の直接・間接循環が消えたことを確認した。現在設計に移動関数への具体的な参照はなく、設計リンクの更新は不要だった。コメント点検はPASS。
