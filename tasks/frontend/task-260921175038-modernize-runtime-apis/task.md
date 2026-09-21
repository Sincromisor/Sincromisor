# 描画とUIの非推奨ライブラリAPIを更新

## 背景 / 目的

Three.js Clock、React MutableRefObject、MediaPipe handednesses に非推奨指定がある。

## 完了条件

- [ ] Clock を Timer に変更して毎フレーム更新する。RefObject に変更する。MediaPipe の読取元を handedness に統一し、保存ログの handednesses キーは維持する。
- [ ] 型検査、描画更新と再生テスト。Timer の更新順・秒単位の差分と左右情報の保存を確認する。

## 変更範囲と確認方法

Clock を Timer に変更して毎フレーム更新する。RefObject に変更する。MediaPipe の読取元を handedness に統一し、保存ログの handednesses キーは維持する。

型検査、描画更新と再生テスト。Timer の更新順・秒単位の差分と左右情報の保存を確認する。

## 文書同期

依存版、外部契約と保存形式は維持するため設計変更は不要。調査・確認結果は本タスクに記録する。
