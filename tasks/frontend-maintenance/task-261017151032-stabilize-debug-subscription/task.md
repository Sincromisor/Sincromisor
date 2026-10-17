# 診断画面の描画ごとの再購読をなくす

## 背景 / 目的

`useDebugConsoleSnapshot` が描画ごとに新しい購読関数を渡し、`useSyncExternalStore` の購読解除・再登録を発生させる。

優先度: 中。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

なし。

## 担当範囲と設計判断

- [`src/features/debug/react/debugConsole.tsx`](../../../sincromisor-frontend/src/features/debug/react/debugConsole.tsx) の購読関数を安定させる。[`src/app/react/useRightToolPanelState.ts`](../../../sincromisor-frontend/src/app/react/useRightToolPanelState.ts) の既存方式を再利用する。
- 診断データの作成・通知頻度、タブ構成、可視性、状態管理クラスは変更しない。

## 完了条件

- [x] 診断通知やタブ選択で再描画しても、同じ管理処理への購読を登録し直さない。
- [x] 新しいスナップショットは反映し、画面を取り外すと購読が解除される。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- 対象ファイルの静的検査・型検査を実行する。既存のブラウザー確認基盤で登録・解除回数を観測し、再描画と取り外しの主要経路を一度確認する。テスト用に新しいDOM依存を追加しない。

## 文書同期

購読の意味は変えず、不要な再登録だけを除くため設計同期は不要。

## 参照

[React公式仕様](https://react.dev/reference/react/useSyncExternalStore#caveats)（参照日: 2026-10-17）。購読関数の参照を安定させる。

## 実施結果

- 購読・取得関数をモジュール単位で固定した。型検査と対象Biomeが成功した。
- 専用Chromeで表示用購読を計測し、診断更新・タブ切替・親からの再描画後も登録1回・解除0回、取り外し後は解除1回だった。更新値の入力欄への反映も確認した。確認スクリプトをacceptance/browser.jsに保存した。
