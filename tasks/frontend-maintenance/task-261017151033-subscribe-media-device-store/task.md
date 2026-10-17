# 機器一覧のReact同期を外部ストア購読へ移行

## 背景 / 目的

`useSincroMediaDeviceState` はサービスの状態をstateに転記している。先行タスクで安定させたスナップショットを `useSyncExternalStore` で直接読む。

優先度: 中〜低。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

[task-261017151032-stabilize-media-device-snapshot](../task-261017151032-stabilize-media-device-snapshot/task.md) の完了後に着手する。

## 担当範囲と設計判断

- [`src/app/react/useSincroMediaDeviceState.ts`](../../../sincromisor-frontend/src/app/react/useSincroMediaDeviceState.ts) と直接の利用者・対象テストを担当する。設定ストアと右側パネルの既存購読方式を再利用する。
- サービスの `start()`、初回 `refresh()`、利用者による再取得は残し、状態の転記だけを除く。機器選択の導出、共有サービスの監視所有権は維持する。

## 完了条件

- [x] 一覧の転記用stateがなくなり、安定した購読・取得関数でサービスの最新状態を読む。初期値と更新を起動前後のUIへ反映する。
- [x] 購読者の一方を取り外しても他方の監視を止めない。再描画だけで購読・機器再取得を繰り返さない。
- [x] 選択中機器の有効性、一覧再取得中・失敗時の案内、手動再取得が維持される。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- 型検査と、初期値・更新・複数購読者の一方の解除・再描画を対象にした小さな結合確認。サービスの列挙規則は先行タスクのテストを再利用する。
- 開発ブラウザーで起動前ダイアログと起動後設定の機器一覧・再取得を確認する。

## 文書同期

[app-shell.md](../../../documents/design/frontend/app-shell.md) のメディア機器一覧をReactが購読する方式を同期する。

## 実施結果

- 転記用stateを除き、安定した購読・取得関数でサービスの現在値を直接読む。監視開始、初回と手動の再取得、選択状態の導出は維持した。
- 型検査、対象Biome、Chrome結合確認が成功。2購読者の一方を外しても監視停止0回、再描画による再購読・再取得なし、失敗時の一覧保持と復旧、登録2回・解除2回を確認した。起動前ダイアログと起動後のマイク・音声設定で再取得操作を確認した。
- 機器APIには代替入力を使い、実機の抜き差しは対象外。既存の共有監視所有権は変更していない。
