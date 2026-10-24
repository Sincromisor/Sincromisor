# 設定と開発者ツールで選択中カテゴリの重複見出しを整理する

## 背景 / 目的

「言葉で説明せずに、UI要素とレイアウトで理解できるようにする」というユーザー要求に従う。2026-10-24、HEAD `30ce9259`で、選択中カテゴリの名前を本文見出しへ再掲する表示を確認した。

起動前詳細と常設設定では「マイク・音声」などがタブと本文に重なり、狭幅では「カテゴリ」の選択値と本文見出しが重なる。開発者ツールでも「Status」「Audio」「RTC」などがタブの直下に繰り返される。調査範囲とタスク群は[調査結果](artifacts/ui-label-survey.md)を参照する。

## 完了条件（受け入れ条件）

- [x] 起動前詳細・常設設定で、選択名と同じ本文見出しを常時重ねない。現在位置はタブの選択状態またはカテゴリ選択欄から分かる。
- [x] 開発者ツールでも選択タブと同義の見出しを除く。「Face」「Pose」など、本文内の異なる情報群を区別する見出しは残す。
- [x] 本文のアクセシブル名を維持する。狭幅で非表示となるタブだけに命名を依存させない。
- [x] カテゴリ切り替え、矢印・Home・End・Tab操作、本文スクロール、固定された主操作を維持し、削除した見出し用の空白や境界線を残さない。

## 設計判断

見出しを別の説明ラベルへ置き換えず、既存のタブ・選択欄と本文の対応を使う。画面全体の題名や入力項目名まで一律に削除しない。ARIAの関連付けと余白は実装時に決める。

## スコープ境界

共通設定の外枠、カテゴリ選択、診断パネルの重複見出しと関連CSSが対象。入力の補足は[共通設定を項目名と入力で理解できる表示に整理する](../task-261024195952-simplify-settings-field-labels/task.md)、体験選択内は[体験選択の説明と再接続案内の重複を整理する](../task-261024195952-simplify-experience-guidance/task.md)で扱う。診断項目・指標名・ロジックは変更しない。

## 実装方針

- [設定の外枠](../../../sincromisor-frontend/src/features/settings/react/shell/settingsShell.tsx)、[カテゴリ選択](../../../sincromisor-frontend/src/features/settings/react/shell/settingsNavigation.tsx)と同ディレクトリのCSSを見直す。`SettingsShellPage.title`の用途と本文の命名を合わせて整理する。
- [診断パネル群](../../../sincromisor-frontend/src/features/debug/react/panels/)の先頭見出しと[診断タブ](../../../sincromisor-frontend/src/features/debug/react/debugConsoleTabs.tsx)、[診断CSS](../../../sincromisor-frontend/src/styles/sincroDebugConsole.css)を確認する。
- [共通タブ](../../../sincromisor-frontend/src/app/shell/react/integratedTabs/integratedTabs.tsx)の既存の識別子・キー操作を再利用する。

## テスト

変更対象の静的検査と型検査・ビルドを行う。`playwright-cli`で起動前詳細・常設設定・開発者ツールを確認し、通常幅のタブと狭幅のカテゴリ選択の両方で現在位置、本文名、キー操作、スクロールを確認する。既存のタブ操作確認を使い、文言削除だけを写す新規単体テストは作らない。

## ドキュメント同期の要否

[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)のカテゴリと本文の命名・表示方針を同期する。診断の構成説明が変わる場合は[診断UI設計](../../../documents/design/frontend/setting-and-debug-ui/debug-design.md)も同期する。通信契約・保存形式は変更しない。

## 実施結果

重複見出しと専用CSSを除去し、設定本文は直接アクセシブル名を持つ。診断は既存タブとの関連付けとFace・Pose見出しを維持した。

変更対象のBiome、`npm run build`、Playwright CLIで起動前詳細・常設設定・診断の1440px/390px表示、矢印・Home・End・Tab、本文名、スクロール、固定開始操作を確認した。専用のローカルViteを使用し、接続先未起動によるRTC設定取得失敗は表示確認に影響しない。文書・コメント点検はPASS。
