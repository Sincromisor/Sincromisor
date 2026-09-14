# 設定パネルの未使用診断ログと状態更新を削除

## 背景 / 目的

設定パネルはログ表示を使っていないが、useSimpleVrmPanelEventState と simpleVrmPanelEventHandlers がチャット・RTC・テロップ履歴を蓄積する。DiagnosticsLogSections は定義以外の参照が見つからない。表示されない状態更新と残った表示部品を取り除く。性能改善量を完了条件にはしない。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 高。作業区分: 通常変更。

依存なし。

## 完了条件（受け入れ条件）

- [x] DiagnosticsLogSections と、表示先のない logs / rtcEvents / telopLogs の保持・更新・専用型が削除されている。
- [x] チャット、テロップ、診断Consoleの既存表示と、接続状態・VAD・視線・カメラ品質案内が維持されている。
- [x] panelLogHelpers のページ固有ログへの参照がなく、dialogPopMessages が使う件数制限処理は維持または使用箇所へ収容されている。

## 設計判断

削除対象は設定パネルの未使用履歴だけとする。ログ管理の新設・統一は行わず、既存サービスの保持件数や通知契約は変更しない。

## スコープ境界

下記のログ部品、パネル用フック・型・イベント処理、不要になった調整値を対象にする。履歴の利用箇所を再検索し、他の表示で使われる部分は残す。

## 実装の参照先

- [diagnosticsLogSections.tsx](../../../sincromisor-frontend/src/pages/simpleVrm/react/components/diagnosticsLogSections.tsx)
- [useSimpleVrmPanelEventState.ts](../../../sincromisor-frontend/src/app/settings/react/useSincroPanelEventState.ts)
- [simpleVrmPanelEventHandlers.ts](../../../sincromisor-frontend/src/app/settings/react/sincroPanelEventHandlers.ts)
- [panelTypes.ts](../../../sincromisor-frontend/src/app/settings/react/panelTypes.ts)
- [panelLogHelpers.ts](../../../sincromisor-frontend/src/app/react/panelLogHelpers.ts)
- [dialogPopMessages.tsx](../../../sincromisor-frontend/src/features/dialog/react/dialogPopMessages.tsx)

## 確認方法

参照検索で削除対象の利用先がないことを確認する。`npm --prefix sincromisor-frontend run build` と、既存のチャット・テロップ・カメラ品質案内の対象テストを実行する。単なる削除を模倣する新規テストは不要。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

設計に未使用のパネル履歴への記述が残っていれば除く。通信契約と保存形式は変更しない。

- [app-shell.md](../../../documents/design/frontend/app-shell.md)

## 実装・確認結果

設定パネル専用の履歴・表示部品・調整値を削除した。ポップ通知の件数制限は利用箇所へ収容し、チャット・テロップ・診断の各サービスと通知契約は維持した。設計の未使用履歴への記載はなかった。

- フロントエンドのビルド: PASS。
- `sincroChatView` / `sincroTelopView` / `panelCameraGuideState`: 3ファイル9テストPASS。
- 変更ファイルのBiome検査、削除対象の参照検索: PASS。
- コメント点検: PASS。
