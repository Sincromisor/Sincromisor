# 体験選択の説明と再接続案内の重複を整理する

## 背景 / 目的

2026-10-24、HEAD `30ce9259`の常設設定「体験」では選択肢を言い直す説明に加え、「モードの変更は停止後の再接続で反映します。」と「体験を変えたときは、接続を停止してからもう一度開始すると会話に反映されます。」が同時に表示される。起動前にも再接続の説明が常時出る。

ユーザーの原則に合わせ、体験は選択肢で伝え、反映に必要な操作だけを文脈に応じて一度示す。

## 完了条件（受け入れ条件）

- [x] 4種類の体験は選択UIの項目名と選択状態で判別できる。通常2体験を言い直すだけの常時説明を除く。
- [x] 起動前の概要・詳細で再接続を促す固定説明を出さず、そのまま開始へ進める。
- [x] 常設設定では再接続による反映の説明を一箇所へまとめ、選択欄と接続操作の関係が配置から分かる。既存の接続・ライフサイクル状態を使い、必要なときに短く案内する。
- [x] 折り返しでのヘッドホン使用、自動ミュートが適用されないこと、サンプル音声の出典と入力が再生に影響しないことなど、選択名で伝わらない固有情報は対象体験で確認できる。
- [x] `chat` / `sincro` / `echo` / `playback`、URL選択、保存、動作への反映とRTC再接続時の反映の区別を維持する。接続に適用済みと誤表示しない。

## 設計判断

選択方式の全面改修は必要としない。共通入力へ起動前・常設の文脈を渡し、既存の接続状態に応じて案内する最小の変更とする。適用待ちの状態機械や自動再接続は追加しない。

## スコープ境界

体験入力・補足・接続操作との配置が対象。カテゴリ見出しは[設定と開発者ツールで選択中カテゴリの重複見出しを整理する](../task-261024195952-remove-redundant-panel-headings/task.md)、トップの体験補助ラベルは[トップページの冗長な補助ラベルを整理する](../task-261024195953-simplify-home-secondary-labels/task.md)で扱う。音声診断・RTC処理は変更しない。

## 実装方針

- [体験入力](../../../sincromisor-frontend/src/features/settings/react/fields/textSettingsFields.tsx)、[補足文](../../../sincromisor-frontend/src/features/settings/react/fields/settingsHelp.ts)、[共通設定の組み立て](../../../sincromisor-frontend/src/features/settings/react/pages/purposeSettingsPages.tsx)を見直す。
- [常設設定](../../../sincromisor-frontend/src/app/settings/react/sincroSettingsPages.tsx)の重複する`SettingsHint`を整理し、[接続操作](../../../sincromisor-frontend/src/app/settings/react/sincroConnectionPage.tsx)との配置を確認する。
- [起動前概要](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogOverview.tsx)と[起動前詳細](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogSettingsPages.tsx)から同じ入力を使う。[起動前の状態](../../../sincromisor-frontend/src/features/dialog/react/useConfigurationDialogSettingsState.ts)と[常設の状態](../../../sincromisor-frontend/src/app/settings/react/useSincroPanelState.ts)が持つ接続・ライフサイクル状態を利用する。

## テスト

変更対象の静的検査と型検査・ビルドを行う。`playwright-cli`で起動前・常設の4体験を選び、言い直しがなく、固有の注意が対象体験で読めることを確認する。停止中と接続中の反映案内を確認し、表示分岐には小さな回帰確認を加える。既存の体験選択・URL引継ぎ確認を使う。

## ドキュメント同期の要否

[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)と[設定項目一覧](../../../documents/design/frontend/setting-and-debug-ui/settings-items.md)の体験説明・反映案内の配置を同期する。体験値・通信契約は変更しない。

## 実施結果

体験選択の言い直しと固定再接続案内を除去し、開始準備中・実行中の常設接続欄だけに手順を表示した。折り返し・サンプル音声の固有情報を選択欄へ関連付けた。対象Biome、ビルド、表示分岐と既存設定ストアのVitest（3件）、Playwright CLIで概要・詳細・常設の4体験、停止中・実行中の表示、両開始ボタンから4体験のURL引継ぎを確認した。実RTC接続は未実施。

文書・コメント点検はPASS。専用のローカルViteを使用し、接続先未起動によるRTC設定取得失敗はUI確認に影響しない。
