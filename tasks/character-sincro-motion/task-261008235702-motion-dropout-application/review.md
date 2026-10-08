# レビュー: task-261008235702-motion-dropout-application

## 判定

APPROVED

## 理由・申し送り

- `createPredictedArm()`が欠損中の観測信頼度を予測状態へ写し、`weightForTemporalArmState()`がその値から適用重みを作るため、信頼度0の短い欠損で予測が最終姿勢へ届かない再現済みの不具合に対応している。
- 現行の`SincroMotionObserveOnlyPipeline`、`SincroPoseRetargeter`、`SincroVrmPoseComposerService`と`VRMCharacterManager.update(nowMs)`は、タスクが定める観測・時系列・最終姿勢の所有境界に対応する。Pose・Hand別の観測時刻と受信時刻、ライブの表示評価時刻、再生の仮想時刻、状態を破棄する切替境界が具体的で、複数の状態所有者をまたぐ変更として実装可能である。
- 左右別の予測・復帰、無到着と未検出、時刻逆行・飛び越し、明示停止、`chat`・顔のみ切替、VRM交換を区別し、観測更新と描画だけによる純粋な予測を分けている。`frame.active`だけで追跡層を落とす現行実装を、左右の`SincroPoseRetargetedArm.active`に基づく部位別合成へ改める対象も明確である。
- 既存の遮蔽・復帰固定入力と加工済み録画を使い、時系列推定から本番合成までを検証する。時間上限は既存設定を出発点にして変更時だけ録画の根拠を残すため、根拠のない性能値、追加撮影、長時間試験、複数環境試験を必須にしていない。
- 公開通信契約は変更しない。変更する本番シンボルのコメント品質は実装時に`documents/rules/source-comments.md`を直接適用でき、本文に省略や任意化の条件はない。

## 自律補完

- なし。
