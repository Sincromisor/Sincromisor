# 描画とUIの非推奨ライブラリAPIを更新

## 背景 / 目的

Three.js Clock、React MutableRefObject、MediaPipe handednesses に非推奨指定がある。

## 完了条件

- [x] Clock を Timer に変更して毎フレーム更新する。RefObject に変更する。MediaPipe の読取元を handedness に統一し、保存ログの handednesses キーは維持する。
- [x] 型検査、描画更新と再生テスト。Timer の更新順・秒単位の差分と左右情報の保存を確認する。

## 変更範囲と確認方法

Clock を Timer に変更して毎フレーム更新する。RefObject に変更する。MediaPipe の読取元を handedness に統一し、保存ログの handednesses キーは維持する。

型検査、描画更新と再生テスト。Timer の更新順・秒単位の差分と左右情報の保存を確認する。

## 文書同期

依存版、外部契約と保存形式は維持するため設計変更は不要。調査・確認結果は本タスクに記録する。

## 確認結果

型検査・ビルド、対象14テストに合格。Timerの連続フレーム差分と、非推奨getterに触れず左右情報を保存する回帰テストを追加した。Biomeの対象確認とコメント点検: PASS。型診断の再走査ではAgentServerが0、frontendは現行契約に必要な独自solveWorldArmIkの2参照のみ。実ブラウザー・カメラによる確認は未実施。
