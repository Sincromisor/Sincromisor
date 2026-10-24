# トップの遷移確認を体験の保存仕様に合わせる

## 背景 / 目的

トップの補助ラベル整理の確認中、既存の `tests/main/main.spec.ts`でURL未指定・不正値の体験を常に `chat`と期待して失敗した。直前の入力操作が `sincro`を保存するため、実装は保存仕様どおり `sincro`を復元している。既存契約は[保存と復元](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md#保存と復元)を参照する。

## 完了条件

- [x] URL未指定・不正値では最後の保存値を復元することを検証する。
- [x] 保存値がない場合の既定値と、有効なURLが保存値に優先することも確認する。
- [x] 既存のトップの画面幅・選択・両開始ボタンの確認を維持し、テストが通る。

## 変更範囲と確認

[既存のトップ確認](../../../sincromisor-frontend/tests/main/main.spec.ts)だけを変更する。実装と保存契約は変更しない。対象Biomeと `npm run browser:test -- --config=sincromisor-frontend/tests/main --workers=1 --reporter=line`で確認する。専用ローカルViteを使用する。

## 実施結果

トップの遷移確認を保存契約へ合わせ、有効なURLの優先、URL適用後も保存値を維持すること、未指定・不正値での復元、保存なしの既定値を確認する形へ修正した。両開始ボタンの対象を4体験へ広げた。対象Biomeと既存Playwrightテスト2件が成功し、画面幅・選択・会話例・遷移の確認を維持した。実装・保存契約は変更していない。

文書・コメント点検はPASS。専用のローカルViteを使用し、接続先未起動によるRTC設定取得失敗はUI確認に影響しない。
