# アプリ制御の単純転送と依存組み立てを統合

## 背景 / 目的

`createSincroAppRuntimeBundle` は多数のコールバックを別の生成関数へ渡し、`createSincroAppStateBridge` は受け取った関数をそのまま返している。RTC停止にも単純転送の生成関数があり、操作を追うための中間層が多い。

根拠はフロントエンドの肥大化レビューに対する改善タスク起票のユーザー要求である。起票時の確認基点は `75ebbdb4d562dfefbd5cbd887e121a8a0b9cc3bb`。実装着手時に現在のコードと呼び出し元を再確認する。

## 完了条件

- [x] 設定購読と旧描画撤去後に残る転送経路を確認し、単純転送だけの生成関数と中間の型を統合・削除する。
- [x] 依存の取得・組み立ての入口を一つにし、同じコールバック列を複数段で受け渡さない。
- [x] 残る呼び出し元の `dialog`、`chat`、`debug`、`rtc`、`state` の必要な操作と初期化順序を維持する。内部APIを変更する場合は全利用箇所を同時更新する。

## 変更範囲と方針

振る舞いを変えない統合であり、機能サービスの所有権、イベント形式、購読の生存期間は変更しない。責務のある変換処理を一括して `Controller`へ戻さず、転送だけの層に限定する。ファイル数や削減行数を完了条件にしない。

- [sincroAppControllerRuntime.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppControllerRuntime.ts)
- [sincroAppBridges.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppBridges.ts)
- [sincroAppController.ts](../../../sincromisor-frontend/src/app/controller/sincroAppController.ts)
- [sincroAppConnectionState.ts](../../../sincromisor-frontend/src/app/events/sincroAppConnectionState.ts)
- [sincroAppEmitHelpers.ts](../../../sincromisor-frontend/src/app/events/sincroAppEmitHelpers.ts)

## 依存タスク

- [チャット描画をReactへ一本化して旧DOM処理を削除](../task-260906004357-remove-legacy-chat-rendering/task.md)
- [テロップ描画をReactへ一本化して旧描画処理を削除](../task-260906004357-remove-legacy-telop-rendering/task.md)
- [React設定購読の状態複製と初期同期を整理](../task-260906004358-simplify-react-settings-subscription/task.md)

## 確認方法

- 削除した関数と型の全参照を確認し、関連する既存テストと型検査を実行する。
- simple-vrm の画面起動と設定パネル開閉を一度確認する。
- `sincromisor-frontend` で `npm run build` を実行する。変更したソースの整形・静的検査は対象ファイルに限定する。
- 実行コマンド、確認結果、未実行項目と理由を本書に追記する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定・診断画面](../../../documents/design/frontend/settings-and-debug-ui.md)の該当記述を実装に合わせ、[設計索引](../../../documents/design/index.md)の導線を確認する。通信形式、公開URL、保存形式の変更は含めない。

## 実施結果

通常変更として現在の作業ツリーで実施した。依存3タスクはすべて `done` を確認した。
依存取得と操作窓口を `createSincroAppRuntimeBundle` に統合し、個別の生成関数、中間の依存・窓口型、`initializeRuntime` を削除した。
状態取得は組み立て済みの操作窓口を直接渡し、RTC停止と接続状態通知の単純転送も削除した。
サービス取得、設定初期化、有効制御処理の公開、購読登録の順序と既存の公開操作を維持した。
責務を持つ接続状態変換、設定適用、イベント変換と購読の生存期間は維持した。

## 確認結果

- `rg` で削除した生成関数・中間型・通知関数を `sincromisor-frontend/src` 全体から検索し、参照が残っていないことを確認した。操作窓口の利用箇所も確認した。
- `sincromisor-frontend` で `npm run test -- src/app/settings/__tests__/sincroAppSettingsStore.test.ts src/features/dialog/model/__tests__/dialogSettingsAccess.test.ts src/features/conversation/chat/react/__tests__/sincroChatView.test.tsx` を実行し、3ファイル・3件が成功した。
- 同ディレクトリで `npm run build` が成功し、TypeScriptの型検査と全ページのビルドを通過した。既存の大きな出力ファイルに対する警告がある。
- 同ディレクトリで変更した8ソースに対する `npx --no-install biome check` が成功した。
- `npm run dev -- --host 127.0.0.1` で起動し、Playwrightから `http://127.0.0.1:5173/simple-vrm/` を開いた。「開始する」→右側ツールメニュー→「基本設定」→「基本設定を閉じる」の順で操作し、起動前ダイアログ、開始時の挨拶、設定パネルの表示・非表示を確認した。
- 変更MarkdownをPrettierで整形・検査し、設計索引から2設計文書への導線を確認した。文書点検とコメント点検はともに `PASS`。
- `npm run tasks:index`、`npm run tasks:index:check`、`npm run tasks:check` と `git diff --check` で完了記録と差分を確認した。

## 未実行事項と環境上の制約

RTC実接続とカメラ・マイク動作は対象外のため未実行。ブラウザー確認ではRTC設定APIが404、メディア取得が権限未付与・機器なしとなったが、画面起動と設定パネル開閉は成功した。
Playwrightのスキルと導入済みCLIの版差異の警告は出たが、操作は成功した。
初回の検査はルートからのBiome実行で設定の重複を検出したため、フロントディレクトリから再実行した。ローカルサーバーとブラウザーの起動はサンドボックス制約を受けたため、権限拡張後に実行した。
今回の変更に起因する既知の残リスクはない。
