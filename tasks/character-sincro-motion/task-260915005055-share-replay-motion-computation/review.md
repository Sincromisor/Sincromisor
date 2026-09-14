# レビュー: task-260915005055-share-replay-motion-computation

## 判定

APPROVED

## 理由・申し送り

- 調査時のHEAD `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf` で、`MotionDebugReplayRuntime` は保存済み reliability / canonical / temporal を厳密に解析して採用し、欠損時だけ再計算する。閲覧画面と指標は保存済み `frame.intent` を正本とし、再生派生の intent は別の表示用状態である。この区別は `motion.md` と実装に一致する。
- 隣接前進だけで推定器状態を継続し、同一フレームへの移動・飛び越し、後方移動、停止、読込、入力切替で初期化する現在の時刻・寿命契約を受け入れ条件に含む。ライブと再生の推定器を別所有にするため、状態の持越しを防げる。
- 共通化は再計算が必要な canonical / temporal / intent の手順だけで、保存値の解析、無効値表示、postProcessing、タイマーを再生側に残す。保存済み値を上書きしない要件が明確であり、保存形式・互換変換を追加しない最小範囲になっている。

## 自律補完

- AUTO_FIX: 保存済み `frame.intent` と再生派生 intent は、既存の閲覧画面の保存値確認と再生処理のジェスチャー入力確認を別々に維持する。両者を同じスナップショットの項目 で比較・代入しない。
