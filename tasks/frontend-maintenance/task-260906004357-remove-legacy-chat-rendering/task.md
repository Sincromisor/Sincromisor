# チャット描画をReactへ一本化して旧DOM処理を削除

## 背景 / 目的

`ChatMessageService` は履歴・通知と直接DOM描画を併せ持ち、Reactの購読開始・終了で旧描画を切り替えている。システムメッセージ等は旧描画停止中もDOM要素を生成している。現行3Dページは共通React画面を使う。

根拠はフロントエンドの肥大化レビューに対する改善タスク起票のユーザー要求である。起票時の確認基点は `75ebbdb4d562dfefbd5cbd887e121a8a0b9cc3bb`。実装着手時に現在のコードと呼び出し元を再確認する。

## 完了条件

- [x] `ChatMessageService` のDOM生成・検索・復元・件数制御と `setDomRenderingEnabled` を削除し、表示は `SincroChatView` が担う。
- [x] `writeUnknownUserMessage`、`writeSystemMessage`、`writeErrorMessage`、`writeResetMessage` の呼び出し元を確認し、不要なDOM戻り値を削除して型と利用箇所を同期する。
- [x] React取り付け前のメッセージを履歴から表示でき、同じIDの更新、表示件数、システムアイコンの後追い更新を維持する。
- [x] 通常メッセージは文字列として表示し、既存の明示的な `trusted_html` の扱いを拡大しない。

## 変更範囲と方針

モデルは履歴と通知を保持し、描画を持たない。HTMLの信頼境界、RTCメッセージ形式、チャットの見た目は変更しない。テロップ撤去と購読全般の整理は含めない。

- [chatMessageService.ts](../../../sincromisor-frontend/src/features/conversation/chat/model/chatMessageService.ts)
- [sincroChatView.tsx](../../../sincromisor-frontend/src/features/conversation/chat/react/sincroChatView.tsx)
- [sincroAppBridgeFactories.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppBridgeFactories.ts)
- [sincroAppBridges.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppBridges.ts)

## 依存タスク

- [会話処理の未使用蓄積と未使用取得APIを削除](../task-260906004357-remove-unused-conversation-state/task.md)

## 確認方法

- 既存のテスト環境を使用し、取り付け前履歴と同一ID更新を確認する最小の回帰テストを追加または更新する。通常文字列がHTMLとして扱われないことも確認する。
- 開発環境の simple-vrm で挨拶とアイコン更新を一度確認する。合成メッセージを使ってよく、バックエンドや実カメラは必須にしない。
- `sincromisor-frontend` で `npm run build` を実行する。変更したソースの整形・静的検査は対象ファイルに限定する。
- 実行コマンド、確認結果、未実行項目と理由を本書に追記する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定・診断画面](../../../documents/design/frontend/settings-and-debug-ui.md)の該当記述を実装に合わせ、[設計索引](../../../documents/design/index.md)の導線を確認する。通信形式、公開URL、保存形式の変更は含めない。

## 実施結果

通常変更として実施。DOM戻り値の利用はなく、書き込みを履歴更新と通知へ統一した。

- `cd sincromisor-frontend && npm run test -- src/features/conversation/chat/react/__tests__/sincroChatView.test.tsx`: 1件成功。取り付け前履歴、同一ID更新、30件制限、HTMLの信頼境界、アイコン更新、購読解除を確認。
- `npm run build`: 成功。既存の大きな出力ファイルに関する警告あり。
- 変更したソースの `biome check` と変更文書のPrettier整形を実施。
- 開発サーバーの `/simple-vrm/` で `playwright-cli -s=maintenance run-code --filename=tasks/frontend-maintenance/task-260906004357-remove-legacy-chat-rendering/acceptance/browser.js` を実行し、合成した挨拶の単一表示とアイコンの後追い更新を確認。
- 共通枠組みの設計を更新。設定・診断画面の仕様に変更はなく、設計索引の既存導線を確認。
- 実機・バックエンド接続は対象外。文書点検・コメント点検はPASS。
- `tasks:index:check`: 成功。`tasks:check` は既存の `task-260904005741-fix-face-landmarker-timestamp` の `review.md` / `impl.md` / `eval.md` 欠落で失敗。今回の変更範囲外。
- 画面にはバックエンド未接続の `config.json` 404と、依存タスクで変更前に再現済みのReact更新ループ警告が出た。チャットの確認は成功し、設定購読は指定された後続タスクで確認する。
