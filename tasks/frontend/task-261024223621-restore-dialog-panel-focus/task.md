# ダイアログと設定パネルのフォーカス移動を整える

## 背景 / 目的

2026-10-24のUIレビュー指摘7。優先度は中。起動時に視覚的に隠したファイル入力へフォーカスが入り、キーボードで基本設定を開いた直後と閉じた後は `body` へ戻った。起動前ダイアログにはアクセシブル名がない。原則§3・§7に基づき、画面が切り替わっても操作位置を見失わないようにする。

## 完了条件（受け入れ条件）

- [ ] 起動前ダイアログの名前が見える見出しと関連付き、初期フォーカスは見える適切な操作に置かれる。非表示のファイル入力へ誘導しない。
- [ ] 設定・診断パネルをキーボードで開くと内部の適切な位置へ移り、閉じると表示中の呼び出し元へ戻る。隠れたメニュー項目や `body` に落とさない。
- [ ] 起動前の概要・詳細切り替え、右側パネルの切り替えでも操作を継続できる。閉じた領域へTab移動しない。
- [ ] メニューの役割に対応したキー操作と閉じる操作を提供し、設定カテゴリの既存の矢印キー・Home/End操作を維持する。

## UIの判断基準

[Web UI・UX設計原則](../../../documents/rules/web-ui-ux.md)と、2026-10-24のユーザー指定「説明しなくても理解できるのがよいUI」を適用する。操作名、配置、まとまり、選択・処理状態、実際の動作で解決する。説明文、補助ラベル、免責文、確認ダイアログの追加を既定の解決策にしない。

追加する文言は、既存の表示から分からない利用条件・影響・失敗・回復方法に限る。追加時は、その文言が必要になる判断を実装記録に短く残す。項目名の言い直しや常時表示の注意書きは増やさず、操作名と支援技術の名前は保持する。

## 設計判断と変更範囲

説明文でキーボード操作を案内する対応より、標準的なフォーカス移動を実装する。メニューが閉じて呼び出し項目が非表示になる場合は、常に見える歯車ボタン等を復帰先にする。右側パネルは非モーダルという既存の意味を維持し、不要なフォーカス閉じ込めを追加しない。

起動前ダイアログは「開始する」「トップへ戻る」で退出する既存の意味を維持する。Escapeの扱いは通常パネルと区別する。会話状態・機器開始停止・VRM選択処理は変更しない。

## 実装の入口

[ダイアログ](../../../sincromisor-frontend/src/features/dialog/react/configurationDialog.tsx)、[開始設定](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogSettingsPanel.tsx)、[開閉同期](../../../sincromisor-frontend/src/features/dialog/model/dialogBridgeDomAdapter.ts)、[右側外枠](../../../sincromisor-frontend/src/app/shell/react/overlay/rightToolFrame.tsx)、[メニュー](../../../sincromisor-frontend/src/features/debug/react/rightToolMenu.tsx)、[設定カテゴリ](../../../sincromisor-frontend/src/features/settings/react/shell/settingsNavigation.tsx)。

## 確認方法

Playwright CLIでページ表示から概要・詳細切り替え、基本設定・診断の開閉までTab・Enter・Escapeで操作する。各切り替え直後の実フォーカス、見える輪郭、復帰先を確認する。320px幅のカテゴリ選択欄でも確認する。隠れた要素への復帰を防ぐ回帰確認と、対象の静的検査・型確認を行う。

## 文書同期

[設定設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)と[診断設計](../../../documents/design/frontend/setting-and-debug-ui/debug-design.md)へ開閉時のフォーカスとキー操作を同期する。
