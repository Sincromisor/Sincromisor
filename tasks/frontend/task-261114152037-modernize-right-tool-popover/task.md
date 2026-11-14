# 右側ツールメニューの開閉と配置を標準APIへ移す

## 背景・目的

RightToolMenuはdocumentの外側クリック監視、独自の表示クラス、絶対配置と重なり順を組み合わせている。説明ポップアップとは別の実装で開閉責務を持ち、画面端への配置も固定している。標準APIへの整理を求められたレビュー結果に基づき、ブラウザーへ委ねられる処理を減らす。

## 完了条件

- [x] メニューにPopover API、配置にCSS Anchor Positioningを使い、外側操作・Escape・表示状態の同期を一本化する。不要になった外側クリック監視と表示専用の重複状態処理を削除する。
- [x] 矢印・Home・Endによる項目移動、Tab／Shift+Tabによる離脱、閉じた後のフォーカス、無効項目の除外を維持する。標準PopoverだけでARIAメニューのキー操作が揃うとは扱わない。
- [x] 会話履歴・設定・診断の排他表示、体験開始・終了、既存のショートカットを維持する。表示の開閉だけで機器制御を呼ばない。
- [x] 狭幅と画面端で項目が切れず、設定の説明を開いたときに意図せずメニューやパネルが閉じない。
- [x] 対象ブラウザーの対応範囲を確認し、必要な代替処理だけを残す。OBS向けのCSS優先順位を維持する。

## 設計判断・範囲

ブラウザーのtoggleイベントからアプリの開閉状態を同期し、既存のアプリ窓口からの開閉要求も同じPopoverへ反映する。右側パネル本体、起動前モーダル、設定分類の状態管理は置き換えない。

[対象ブラウザー](../../../documents/design/frontend/pages.md#対象ブラウザーとcss)に従う。[Modern Web Guidanceの配置ガイド](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-atoms/viewport-aware-dropdowns)を、配置反転とARIAメニュー操作を分ける判断に使う（2026-11-14参照）。説明部品の実装と競合する挙動は[説明ポップアップ](../task-261114152036-modernize-settings-help-popover/task.md)完了後に確認する。

## 主な変更箇所

[メニュー](../../../sincromisor-frontend/src/features/debug/react/rightToolMenu.tsx)、[キー操作](../../../sincromisor-frontend/src/features/debug/react/useRightToolMenuKeyboard.ts)、[パネル状態](../../../sincromisor-frontend/src/app/react/useRightToolPanelState.ts)、[CSS](../../../sincromisor-frontend/src/styles/sincroDebugConsole.css)。

## 確認方法

既存の[フォーカス試験](../../../sincromisor-frontend/tests/ui/focus.spec.ts)と[体験メニュー試験](../../../sincromisor-frontend/tests/ui/experienceMenu.spec.ts)を対象に、メニュー開閉・キー移動・パネル選択を確認する。Chromeで狭幅時の配置と説明部品との同時利用を確認する。表示変更が機器取得を発生させないことを既存の試験で維持する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の該当する責務・挙動を同期する。外部RTC契約は変更しない。

## 実装・確認結果

右側メニューを`popover="auto"`へ変更し、外側クリック監視、表示クラス、重複する非表示指定と固定方向の飾りを削除した。起点との配置と画面端の反転はCSS Anchor Positioningへ委ねる。toggle通知は実際のDOM状態から同期し、項目実行とTab離脱は通知前でも実際のPopoverを閉じる。矢印による開閉直後の操作でも、遅れた初期フォーカスが移動結果を上書きしない。

説明のEscapeでは既定動作も抑え、説明を閉じた後に下のメニューまで閉じる問題を修正した。既存の項目移動、パネル排他、体験終了・再開始、ショートカットを維持した。

Chrome 157でフォーカス・体験メニュー・設定操作の3ファイル11件が成功した。1440pxと320pxで斜め移動、説明とメニューの併用、無効項目の除外、Tab／Shift+Tab、画面下端・左右端での配置反転、外側操作、OBS既定CSSと追加指定に対する優先順位を確認した。表示だけでは機器を取得しないことも確認した。メニューと機器の試験ではキャラクター描画を設定で無効にし、VRMの実表示は依存タスクの試験で確認している。

対象のBiome、TypeScript型確認、フロントエンド構造確認と変更Markdownの整形を実行した。設計文書と変更理解範囲のコメントを点検した。対象のChromium 150以降ではPopoverとCSS Anchor Positioningを使用できるため依存追加はなく、配置の`@supports`外ではブラウザー既定の中央配置を保つ。対応版の判断は依存タスクと同じ[Popoverの公式説明](https://developer.chrome.com/blog/popover-api)と[Anchor Positioningの公式説明](https://developer.chrome.com/blog/anchor-positioning-api/)による。

検証環境はNode.js 24.21.0／npm 11.19.0。指定のNode.js 26.12.1／npm 11.21.1とOBS実機での確認は未実行。
