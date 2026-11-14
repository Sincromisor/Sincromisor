# 右側ツールメニューの開閉と配置を標準APIへ移す

## 背景・目的

RightToolMenuはdocumentの外側クリック監視、独自の表示クラス、絶対配置と重なり順を組み合わせている。説明ポップアップとは別の実装で開閉責務を持ち、画面端への配置も固定している。標準APIへの整理を求められたレビュー結果に基づき、ブラウザーへ委ねられる処理を減らす。

## 完了条件

- [ ] メニューにPopover API、配置にCSS Anchor Positioningを使い、外側操作・Escape・表示状態の同期を一本化する。不要になった外側クリック監視と表示専用の重複状態処理を削除する。
- [ ] 矢印・Home・Endによる項目移動、Tab／Shift+Tabによる離脱、閉じた後のフォーカス、無効項目の除外を維持する。標準PopoverだけでARIAメニューのキー操作が揃うとは扱わない。
- [ ] 会話履歴・設定・診断の排他表示、体験開始・終了、既存のショートカットを維持する。表示の開閉だけで機器制御を呼ばない。
- [ ] 狭幅と画面端で項目が切れず、設定の説明を開いたときに意図せずメニューやパネルが閉じない。
- [ ] 対象ブラウザーの対応範囲を確認し、必要な代替処理だけを残す。OBS向けのCSS優先順位を維持する。

## 設計判断・範囲

ブラウザーのtoggleイベントからアプリの開閉状態を同期し、既存のアプリ窓口からの開閉要求も同じPopoverへ反映する。右側パネル本体、起動前モーダル、設定分類の状態管理は置き換えない。

[対象ブラウザー](../../../documents/design/frontend/pages.md#対象ブラウザーとcss)に従う。[Modern Web Guidanceの配置ガイド](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-atoms/viewport-aware-dropdowns)を、配置反転とARIAメニュー操作を分ける判断に使う（2026-11-14参照）。説明部品の実装と競合する挙動は[説明ポップアップ](../task-261114152036-modernize-settings-help-popover/task.md)完了後に確認する。

## 主な変更箇所

[メニュー](../../../sincromisor-frontend/src/features/debug/react/rightToolMenu.tsx)、[キー操作](../../../sincromisor-frontend/src/features/debug/react/useRightToolMenuKeyboard.ts)、[パネル状態](../../../sincromisor-frontend/src/app/react/useRightToolPanelState.ts)、[CSS](../../../sincromisor-frontend/src/styles/sincroDebugConsole.css)。

## 確認方法

既存の[フォーカス試験](../../../sincromisor-frontend/tests/ui/focus.spec.ts)と[体験メニュー試験](../../../sincromisor-frontend/tests/ui/experienceMenu.spec.ts)を対象に、メニュー開閉・キー移動・パネル選択を確認する。Chromeで狭幅時の配置と説明部品との同時利用を確認する。表示変更が機器取得を発生させないことを既存の試験で維持する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の該当する責務・挙動を同期する。外部RTC契約は変更しない。
