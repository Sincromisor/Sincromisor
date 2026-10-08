# 評価: task-261008235702-finger-observation-expiry

## 判定

PASS

## 根拠

- `FingerCurlObservation`が左右別に未加工の特徴量と観測時刻を保持し、有効なHand観測だけを更新する。無効・無到着の入力は観測基点を延長せず、評価時刻との差が250msを超えると中立指姿勢へ戻る。入力切替、停止、モード変更、VRM交換の初期化経路も合成サービスの履歴を破棄する。
- 低信頼度、誤割当、未検出、同時刻再描画、時計変換、再生停止、左右独立、`curlScale`の一回適用、指ボーンだけの所有を対象テストで確認した。`npm run test -- --run src/character/motionIntent/__tests__/fingerCurlPoseLayer.test.ts src/character/runtime/__tests__/fingerObservationExpiry.test.ts src/character/runtime/__tests__/sincroVrmPoseComposer.test.ts` は3ファイル・21件で成功した。
- 保存済み3区間・118 Hand観測の再計算記録では、全118件が無到着の1秒後に中立へ戻った。[集計](artifacts/comparison-summary.json)と[再計算関数](artifacts/replay-check.js)は、Poseだけの記録から指を復元せずHand観測を入力にする。
- `documents/design/frontend/character/motion.md`と`tracking.md`は保持期限、時計対応、無効観測、意図から独立した期限評価を実装と同期している。`npm run check`、`npm run build`、`git diff --check`は成功した。Biomeの既存助言とViteのチャンクサイズ警告は今回の変更による失敗ではない。

## 残課題

なし
