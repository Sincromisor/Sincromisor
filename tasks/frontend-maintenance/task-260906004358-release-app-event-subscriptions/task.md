# アプリ制御の差し替え時に旧イベント購読を解除

## 背景 / 目的

有効な `SincroAppController` を差し替える仕組みがある一方、管理処理への購読解除関数は破棄され、`window`イベントも解除されない。同一ページ内の再生成では旧制御処理が通知先として残る。通常のMPA遷移での不具合は未再現である。

根拠はフロントエンドの肥大化レビューに対する改善タスク起票のユーザー要求である。起票時の確認基点は `75ebbdb4d562dfefbd5cbd887e121a8a0b9cc3bb`。実装着手時に現在のコードと呼び出し元を再確認する。

## 完了条件

- [x] 管理処理と`window`への購読登録が解除関数を返し、`SincroAppController` が自分で登録した解除処理を保持する。
- [x] 有効制御処理を差し替える際、旧制御処理の外部イベント購読を解除してから新しい購読へ移る。解除は繰り返しても安全にする。
- [x] 旧制御処理への通知が止まり、新制御処理と既存React購読へ必要な初期状態と以後の通知が届く。
- [x] 通常のRTC停止後も設定画面の購読は維持し、RTC停止とアプリのイベント購読解除を混同しない。

## 変更範囲と方針

所有者は各 `SincroAppController` とし、対象資源はそのインスタンスが登録するイベント購読だけに限定する。既存の差し替えAPIを維持する局所修正とする。共有サービス、RTC、カメラ、ワーカー、描画ループの停止・再起動を含めず、全アプリの終了機構は作らない。

- [sincroAppManagerSubscriptionBinder.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppManagerSubscriptionBinder.ts)
- [sincroAppControllerSubscriptions.ts](../../../sincromisor-frontend/src/app/events/sincroAppControllerSubscriptions.ts)
- [sincroAppWindowEventBinder.ts](../../../sincromisor-frontend/src/app/events/sincroAppWindowEventBinder.ts)
- [sincroAppControllerWindowEvents.ts](../../../sincromisor-frontend/src/app/events/sincroAppControllerWindowEvents.ts)
- [sincroAppController.ts](../../../sincromisor-frontend/src/app/controller/sincroAppController.ts)
- [sincroAppActiveControllerRegistry.ts](../../../sincromisor-frontend/src/app/controller/sincroAppActiveControllerRegistry.ts)

## 依存タスク

- [アプリ制御の単純転送と依存組み立てを統合](../task-260906004358-collapse-app-forwarding-layers/task.md)

## 確認方法

- 同一ページ内で制御処理を差し替え、管理処理イベントと`window`イベントの各一件が新制御処理だけへ届く最小の回帰テストを追加する。旧購読の解除と解除の再実行も確認する。
- 既存React購読の差し替え確認を行い、RTC停止だけでは設定通知が失われないことを確認する。
- `sincromisor-frontend` で `npm run build` を実行する。変更したソースの整形・静的検査は対象ファイルに限定する。
- 実行コマンド、確認結果、未実行項目と理由を本書に追記する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定・診断画面](../../../documents/design/frontend/settings-and-debug-ui.md)の該当記述を実装に合わせ、[設計索引](../../../documents/design/index.md)の導線を確認する。通信形式、公開URL、保存形式の変更は含めない。

## 実装と確認結果

通常変更として現在の作業ツリーで実装した。依存タスクは `done` / `PASS` であり、記載された6ファイルと呼び出し元が現在の実装に存在することを確認した。自律補完や仕様変更はない。

各登録処理の解除関数を制御インスタンスが保持し、有効制御処理の差し替え時に旧購読を解除する。解除済みの関数は保持配列から除去し、再解除で共有サービスや新購読へ影響しない。RTC停止処理は設定購読を維持する。

フロントエンドのディレクトリで次を実行した。

- `npm run test -- src/app/controller/__tests__/sincroAppController.test.ts src/app/settings/__tests__/sincroAppSettingsStore.test.ts`: 2件成功。共有サービスの新登録前に旧登録がなくなること、管理処理とウィンドウから新制御だけへの通知、解除の再実行、既存React向け購読の初期同期・差し替え、RTC停止後の設定通知を確認した。機器と描画の起動は代替し、制御処理・登録処理・React向け購読処理は実装を通した。
- `npm run build`: 型検査とビルド成功。既存の大きな配信ファイルに対する警告とReact用プラグインの切り替え推奨表示がある。
- `./node_modules/.bin/biome check src/app/controller/__tests__/sincroAppController.test.ts src/app/controller/sincroAppController.ts src/app/controller/sincroAppActiveControllerRegistry.ts src/app/bridges/sincroAppManagerSubscriptionBinder.ts src/app/events/sincroAppControllerSubscriptions.ts src/app/events/sincroAppControllerWindowEvents.ts src/app/events/sincroAppWindowEventBinder.ts`: 7ファイル成功。
- 変更した本書と設計文書2件はPrettierで整形・確認した。設計索引から両設計文書への導線を確認した。

ルートで `npm run tasks:index:check` と `npm run tasks:check` を実行し、347件のタスクと索引の整合を確認した。`git diff --check` も成功した。

文書点検と、変更箇所・購読登録・差し替え・解除・RTC停止の直接範囲のコメント点検は `PASS`。実ブラウザーでの機器接続と描画確認は、変更対象がイベント購読に限定されるため実行していない。既知の残不具合はない。
