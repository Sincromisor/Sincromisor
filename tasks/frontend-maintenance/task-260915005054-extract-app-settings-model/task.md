# 通常設定の状態と適用規則をダイアログから独立

## 背景 / 目的

通常設定は DialogStateStore に保存され、DialogManager が適用規則と変更通知を持つ。SincroAppSettingsStore はその結果をReactへ公開する読み取り用スナップショットであり、単純な重複ストアではない。ダイアログの生成を経由しなければ通常設定を利用できない責務境界を整理する。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 中。作業区分: 高リスク変更（設定の正本・復元・購読の所有先を変更）。

依存なし。

## 完了条件（受け入れ条件）

- [x] 通常設定値・操作可否・入力の適用規則・利用者編集通知の正本が app/settings にあり、DialogManager / DialogStateStore は同じ設定を別途保持しない。
- [x] ダイアログと共通パネル、音声・視線・シーンが同じ適用済み設定を使い、既存の settingsStore による安定した参照と一括通知、settings_snapshot のシーン通知を維持する。
- [x] ページ既定値→保存値→URL指定の復元優先順位、復元時の非保存、同値の明示編集、非有限数の正規化、既定機器への復帰、利用不可項目と自動ミュートの連動が維持される。
- [x] 保存キー・版・対象項目と、全設定初期化、破損保存値・保存失敗時の既存挙動が維持される。

## 設計判断

app/settings がページ内の共有設定モデルを所有し、アプリの組み立て箇所が既存利用者へ渡す。DialogManager は開閉・開始案内・VRM操作を担当する。機器監視から設定利用可否への反映とダイアログ開始案内への反映を分ける。Looking Glassの実行時適用、姿勢・音声・視線の診断調整の所有はこの段階では変更しない。

## スコープ境界

DialogStateStore の通常設定部分、DialogManager の設定API、設定規則・機器状態の接続、app/settings と全利用者の参照を変更する。名称変更だけでダイアログ依存を残さない。汎用ストアや依存注入の枠組みは追加しない。

## 実装の参照先

- [dialogStateStore.ts](../../../sincromisor-frontend/src/features/dialog/model/dialogStateStore.ts)
- [dialogManager.ts](../../../sincromisor-frontend/src/features/dialog/model/dialogManager.ts)
- [sincroAppSettingsPolicy.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsPolicy.ts)
- [sincroAppSettingsMediaDevices.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsMediaDevices.ts)
- [sincroAppSettingsApplyFlow.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsApplyFlow.ts)
- [sincroAppSettingsStore.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsStore.ts)
- [sincroAppSettingsPersistence.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsPersistence.ts)
- [sincroAppSettingsReset.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsReset.ts)
- [sincroAppControllerRuntime.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppControllerRuntime.ts)

## 確認方法

dialogSettingsAccess / sincroAppSettingsStore / sincroAppSettingsPersistence / sincroAppSettingsReset / sincroAppPoseSettings の既存テストを新しい所有境界に合わせる。ダイアログを生成しない設定適用と、実アプリ窓口での復元・編集・購読解除を確認する。開発環境で通常ページの設定変更と再読込による復元を一度確認する。高リスク変更の独立評価と全体確認はタスク管理の作業経路に従う。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

設定の正本、機器状態からの反映、保存と復元、購読の所有境界を同期する。公開設定と保存形式は維持する。

- [app-shell.md](../../../documents/design/frontend/app-shell.md)
- [settings-design.md](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)

## 実装・確認結果

通常設定の値・操作可否・規則・利用者編集通知を `SincroAppSettingsModel` と設定層の既存処理へ分離し、音声・視線・動作・スナップショット・保存購読を接続した。ダイアログは開閉・開始案内・VRMだけを保持する。機器監視は有効アプリで接続・解除する。

- 対象8ファイル15テスト、ビルド、全105ファイル633テスト: PASS（既存の2テストはスキップ）。
- ブラウザーで通常ページの題名を変更し、再読込後の保存値復元を確認した。RTCサーバーとの会話・実機機器取得は未確認。
- 全体ゲートは既存Markdown15ファイルの整形不一致で停止した。ビルド・全テストを個別に実施し、変更Markdownは整形済み。
- 旧アプリ購読テストのモックを実設定モデルへ置換し、差し替え・再解除・RTC停止後通知が通ることを確認した。
- 独立評価: PASS。対象6ファイル18テストを再確認した。
- 設計同期・コメント点検・構造検査: PASS。
