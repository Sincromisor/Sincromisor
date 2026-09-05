# テロップ描画をReactへ一本化して旧描画処理を削除

## 背景 / 目的

`TalkManager` は `TalkLegacyTelopRenderer` とReact向けの文字列履歴を併用し、購読時に旧描画を停止し解除時に復元している。現行の共通画面では `SincroTelopView` が描画を担う。

根拠はフロントエンドの肥大化レビューに対する改善タスク起票のユーザー要求である。起票時の確認基点は `75ebbdb4d562dfefbd5cbd887e121a8a0b9cc3bb`。実装着手時に現在のコードと呼び出し元を再確認する。

## 完了条件

- [x] `TalkLegacyTelopRenderer` とその生成・呼び出し、`setTelopDomRenderingEnabled` と切替用の型・購読処理を削除する。
- [x] `TalkTelopSegmentBuffer` を文字列履歴として維持し、React取り付け前の履歴と受信後の表示更新が機能する。
- [x] `speech_id` ごとの文字列連結、空文字の正規化、履歴制限、`currentMora()` の口形同期用情報を維持する。

## 変更範囲と方針

表示の旧経路だけを撤去する。`telop_ch` の通信形式、時間計算、口形同期、表示デザインは変更しない。チャットの変更を取り込む必要はない。

- [talkManager.ts](../../../sincromisor-frontend/src/features/conversation/talk/talkManager.ts)
- [talkLegacyTelopRenderer.ts](../../../sincromisor-frontend/src/features/conversation/telop/model/talkLegacyTelopRenderer.ts)
- [sincroTelopView.tsx](../../../sincromisor-frontend/src/features/conversation/telop/react/sincroTelopView.tsx)
- [sincroAppBridgeFactories.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppBridgeFactories.ts)
- [sincroAppBridges.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppBridges.ts)

## 依存タスク

- [会話処理の未使用蓄積と未使用取得APIを削除](../task-260906004357-remove-unused-conversation-state/task.md)

## 確認方法

- 既存の文字列履歴テストを実行し、合成した受信メッセージで履歴からの初期表示と追加更新を最小の回帰確認に残す。
- 開発環境で合成したテロップを表示し、二重描画や取り付け前文字列の欠落がないことを一度確認する。
- `sincromisor-frontend` で `npm run build` を実行する。変更したソースの整形・静的検査は対象ファイルに限定する。
- 実行コマンド、確認結果、未実行項目と理由を本書に追記する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定・診断画面](../../../documents/design/frontend/settings-and-debug-ui.md)の該当記述を実装に合わせ、[設計索引](../../../documents/design/index.md)の導線を確認する。通信形式、公開URL、保存形式の変更は含めない。

## 実施結果

通常変更として旧描画クラスと切替APIを削除した。切替専用の購読前・解除時処理は他の利用者がなく、共通購読関数からも削除した。

- `cd sincromisor-frontend && npm run test -- src/features/conversation`: 2件成功。履歴からの初期描画、同一発話の連結、空文字、受信後の更新、履歴制限、口形同期、購読解除を確認。
- 起票時に記載された既存の文字列履歴テストは現行コードになく、上記回帰テストで補完した（`AUTO_FIX`）。
- `npm run build` と変更ソースの `biome check`: 成功。既存の大きな出力ファイルに関する警告あり。
- 開発サーバーの `/simple-vrm/` で `playwright-cli -s=maintenance run-code --filename=tasks/frontend-maintenance/task-260906004357-remove-legacy-telop-rendering/acceptance/browser.js` を実行。取り付け前履歴と追加更新を確認し、フッターの同一発話が1要素であることを確認した。
- 確認スクリプトはViteが実際に読み込んだ管理モジュールを参照する。更新時刻付きURLと別のURLで読み込むと別インスタンスになり、最初の画面確認は待機時間切れとなった。確認スクリプト修正後は成功。
- 共通枠組みの設計を同期し、設定・診断画面と設計索引に追加変更が不要であることを確認。文書点検・コメント点検はPASS。
- バックエンド未接続の404と既存のReact更新ループ警告は残る。実機・バックエンド接続は対象外。
- `tasks:index:check` は成功。`tasks:check` は既存の `task-260904005741-fix-face-landmarker-timestamp` の記録3件欠落で失敗し、今回の変更範囲外。
