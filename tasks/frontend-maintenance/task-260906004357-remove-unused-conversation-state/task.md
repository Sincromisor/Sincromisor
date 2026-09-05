# 会話処理の未使用蓄積と未使用取得APIを削除

## 背景 / 目的

`TalkManager.telopChannelMessage` は受信ごとに追加されるが読み出しも上限もなく、不要なメモリ保持が続く。`ChatMessageService.getMessagesSnapshot()` にも呼び出しがなく、描画情報を含む `getMessageViewSnapshot()` が使用されている。

根拠はフロントエンドの肥大化レビューに対する改善タスク起票のユーザー要求である。起票時の確認基点は `75ebbdb4d562dfefbd5cbd887e121a8a0b9cc3bb`。実装着手時に現在のコードと呼び出し元を再確認する。

## 完了条件

- [x] `telopChannelMessage` とその追加処理を削除し、読み出されない受信履歴を保持しない。
- [x] `getMessagesSnapshot()` の全呼び出し元を再確認し、参照がない取得APIを削除する。
- [x] `currentMora()`、件数制限付きテロップ文字列、チャット履歴と通知の振る舞いを維持する。

## 変更範囲と方針

現在使われている履歴や口形同期用の状態は残す。旧DOM描画の撤去は後続タスクへ分ける。

- [talkManager.ts](../../../sincromisor-frontend/src/features/conversation/talk/talkManager.ts)
- [chatMessageService.ts](../../../sincromisor-frontend/src/features/conversation/chat/model/chatMessageService.ts)

## 依存タスク

なし。単独で着手できる。

## 確認方法

- rg で削除対象の実装参照が残らないことと、残す履歴の消費先を確認する。
- 既存の会話処理の対象テストがあれば実行する。単純削除をなぞる専用テストは追加しない。
- `sincromisor-frontend` で `npm run build` を実行する。変更したソースの整形・静的検査は対象ファイルに限定する。
- 実行コマンド、確認結果、未実行項目と理由を本書に追記する。

## 文書同期

利用者向けの挙動と公開契約は変更しないため、設計文書の改訂は原則不要。削除対象を現行機能として説明する箇所があれば、その記述だけ同期する。

## 実施結果

通常変更として未使用の受信履歴と取得メソッドを削除した。`rg` で削除対象の実装参照がないことと、口形同期・テロップ・Reactチャット履歴の消費先を確認した。

- フロントエンドで `npx biome check src/features/conversation/talk/talkManager.ts src/features/conversation/chat/model/chatMessageService.ts` と `npm run build` が成功した。
- 会話処理配下に既存テストはなく、単純削除専用のテストは追加していない。実機通信確認は挙動変更を伴わないため未実施。
- ビルドの500 kB超の分割ファイル警告は既存構成によるもの。既知の残リスクはない。文書点検・コメント点検はPASS。
- `npm run tasks:index:check` は成功。`npm run tasks:check` は変更範囲外の `task-260904005741-fix-face-landmarker-timestamp` に既存の `review.md`・`impl.md`・`eval.md` 欠落があり失敗した。
