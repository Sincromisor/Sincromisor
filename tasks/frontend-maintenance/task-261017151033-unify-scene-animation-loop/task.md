# 通常描画とXR描画をThree.jsのループへ統一

## 背景 / 目的

`VRMScene` は通常描画の独自requestAnimationFrameとXR用setAnimationLoopを別に管理している。予約責務をThree.jsへ集約し、同じフレーム処理を使う。

優先度: 中。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

なし。

## 担当範囲と設計判断

- [`src/character/scene/vrmScene.ts`](../../../sincromisor-frontend/src/character/scene/vrmScene.ts) と [`src/character/scene/__tests__/vrmScene.test.ts`](../../../sincromisor-frontend/src/character/scene/__tests__/vrmScene.test.ts) が主担当範囲。Looking Glass側は接続・復帰の互換確認に限定する。
- 通常・XRの予約を `renderer.setAnimationLoop` に統一する。環境→キャラクター→描画の順序、フレーム内の時刻取得位置、 `renderOnce(nowMs)` の明示時刻を維持する。
- 通常の `start()` が行う初回描画とXR側の初回予約の違いを既存テストに照らして維持する。独自RAFとレンダラーの二重予約を残さない。
- 汎用のシーン破棄API、Timerの再設計、XRセッション状態機械、Looking Glassの入力復旧処理は改修しない。

## 完了条件

- [x] 継続描画の予約がsetAnimationLoopの一系統になり、通常・XR・単発描画で既存の更新順・時刻の意味を保つ。
- [x] XRセッションの開始・終了で描画が二重化せず通常表示へ復帰する。Looking Glassの既存復旧処理と予約が競合しない。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- 型検査・ビルド、既存の `vrmScene.test.ts` と時刻・再生に直接関わるテスト。予約の所有者と初回動作を検査し、描画内容の網羅テストは追加しない。
- 開発ブラウザーで通常表示を確認する。XR開始・終了・通常表示への復帰は既存の確認環境で一往復を観測する。Looking Glass実機が利用できない場合は、その確認を未実施として明示し、モックを実機確認として扱わない。
- 描画予約とXRの生存期間を扱うため仕様の独立レビューを行う。今回の変更による予約・復帰の確認失敗を未実施扱いで完了させない。

## 文書同期

[character/overview.md](../../../documents/design/frontend/character/overview.md) の描画ループ責務を同期する。通信・ページURL・再生時刻契約は変更しない。

## 参照

[Three.js公式仕様](https://threejs.org/docs/pages/WebGLRenderer.html#setAnimationLoop)（参照日: 2026-10-17）。通常描画もレンダラーのループで予約する。

## 実施結果

- 通常・XRの継続予約をsetAnimationLoopへ統一し、通常起動の即時描画、環境→キャラクター→描画の順序、時刻取得位置、単発描画を維持した。独立仕様レビューはAPPROVED。
- ビルド・対象Biome・描画と再生の7テストが成功。専用Chromeの実レンダラーで通常描画を確認し、模擬sessionstartで通常予約が停止、sessionendで再開した（16→21フレーム）。独自RAFは残らない。
- XRセッションとLooking Glass実機は利用できず未確認。模擬イベント確認を実機確認とは扱わない。既存の入力・配置復旧RAFは継続描画とは別の処理として維持した。
