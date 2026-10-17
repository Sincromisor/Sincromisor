# チャット表示をサービスの履歴購読へ移行

## 背景 / 目的

サービスとReactに同じ履歴の更新・件数制限があり、変更時に双方を同期する必要がある。先行タスクのスナップショットを表示の入力にし、React側の二重管理をなくす。

優先度: 中。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

[task-261017151032-stabilize-chat-snapshot](../task-261017151032-stabilize-chat-snapshot/task.md) の完了後に着手する。

## 担当範囲と設計判断

- [`src/features/conversation/chat/react/sincroChatView.tsx`](../../../sincromisor-frontend/src/features/conversation/chat/react/sincroChatView.tsx)、[`src/app/bridges/sincroAppBridges.ts`](../../../sincromisor-frontend/src/app/bridges/sincroAppBridges.ts)、[`src/app/bridges/sincroAppControllerRuntime.ts`](../../../sincromisor-frontend/src/app/bridges/sincroAppControllerRuntime.ts) と直接の型・テストを担当する。
- 既存の有効AppControllerの差し替え購読を再利用し、そのchat窓口からサービスを購読する。履歴の `applyChatViewRecord` と転記用stateを削除する。
- 先行タスクの旧取得APIは全呼び出し元を確認し、不要になったものだけ削除する。RTC・診断などが使うイベント配信は維持する。サービスの更新規則やHTMLの信頼境界は変更しない。

## 完了条件

- [x] 表示履歴とアイコンがサービスのスナップショットだけから決まり、React側に30件制限・ID更新の実装が残らない。
- [x] 初期履歴、更新、アイコン変更、controller未登録時の空表示を維持する。差し替え・解除・画面取り外しで旧購読を解除し、旧購読の通知から画面を更新しない。共有singletonであるチャットサービスへの正当な更新は、新controllerの購読で反映する。
- [x] 文字列のエスケープと、許可されたsystem/resetのHTML表示を維持する。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- 型検査、既存のチャット表示テスト、有効controllerの接続・差し替え・解除を含む小さな結合確認。履歴規則は先行タスクのテストを再利用する。
- 開発ブラウザーで初期履歴と受信後の更新・アイコンを確認する。未使用取得APIの削除時は呼び出し検索と型検査で取り残しを確認する。

## 文書同期

[app-shell.md](../../../documents/design/frontend/app-shell.md) のReactとサービスの接続、チャット窓口、購読解除の説明を同期する。公開通信契約は維持する。

## 実施結果

- React側の履歴state・30件制限・同一ID更新を削除し、有効AppControllerのchat窓口からサービスを直接購読する。不要な旧取得APIも呼び出し検索後に削除した。
- 型検査、対象Biome、チャットとcontrollerの3テストが成功。Chromeの結合確認で未登録時の空表示、初期履歴、更新とアイコン、共有サービスへの更新、差し替え・解除・取り外しを確認した。購読は登録3回・解除3回で制御処理の購読も残らない。設計を同期した。
