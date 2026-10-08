# 評価: task-261008235701-motion-coordinate-consistency

## 判定

PASS

## 根拠

- 肩・腰・肘・手首を `world.rawX/Y/Z` の共通座標からVRM軸へ変換し、旧記録で生座標が無い場合は欠損として扱う。体幹基底は直交化し、退化時は履歴または中立へ戻る。
- 肩幅単位で肩相対方向を作ってからVRM腕長を適用する。固定入力で平行移動・一様拡大・VRM拡大、左右、前後、交差、傾いた肩線、腰欠損を検証した。
- 6動作610フレームの再計算で、候補の体幹由来は全件 `pose`、到達制限は0件だった。実写との最終表示不一致は[比較記録](../task-261008235701-recorded-motion-quality-baseline/artifacts/comparison-results.md)に品質改善を主張しない限界として記録されている。
- `npm run test -- ...` による変更範囲10ファイル71件、`npm run build`、対象MarkdownのPrettier、`git diff --check`がPASS。座標・保存契約を[モーション設計](../../../documents/design/frontend/character/motion.md)へ同期し、コメントを点検した。

## 残課題

なし
