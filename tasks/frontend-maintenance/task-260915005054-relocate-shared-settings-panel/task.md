# 共通設定パネルをページ固有領域からアプリ層へ移動

## 背景 / 目的

SincroControlPanel と関連フックは通常・360度・Looking Glassで共用されるが、pages/simpleVrm/react に置かれている。共通機能の変更がページ固有実装に見え、派生ページから通常ページへの参照が発生している。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 高。作業区分: 統合変更。

先行: [設定パネルの未使用診断ログと状態更新を削除](../task-260915005053-remove-unused-panel-logs/task.md)。先行タスクが移したファイルは移動先を参照する。

## 完了条件（受け入れ条件）

- [x] 3ページが app/settings/react 配下の共通パネルを利用し、共通パネル・フック・型を参照するための pages/simpleVrm への依存がない。
- [x] features/settings/react の既存入力部品・カテゴリ・枠組みを再利用し、ページ固有の指定はタイトルと表示構成に限定される。
- [x] 起動前後の設定表示、Looking Glassの初期カテゴリ、較正再試行とカメラ品質案内が移動前と同じ経路で動作する。

## 設計判断

配置と名称を実際の共有範囲へ合わせる。各ページの起動入口は残す。入力部品は features/settings/react、アプリに接続するパネルとフックは app/settings/react に置く。旧経路の再公開だけを残す互換層は作らない。

## スコープ境界

通常ページの共通パネル、関連部品・フック・型・対象テストと、3ページの参照元を移す。先行タスクで削除した履歴は移さない。較正の所有権、通常設定モデル、ページ初期化の変更は別タスクとする。

## 実装の参照先

- [simpleVrmControlPanel.tsx](../../../sincromisor-frontend/src/app/settings/react/sincroControlPanel.tsx)
- [useSimpleVrmPanelState.ts](../../../sincromisor-frontend/src/app/settings/react/useSincroPanelState.ts)
- [simpleVrmSettingsPages.tsx](../../../sincromisor-frontend/src/app/settings/react/sincroSettingsPages.tsx)
- [vrm360ControlPanel.tsx](../../../sincromisor-frontend/src/pages/vrm360/react/vrm360ControlPanel.tsx)
- [lookingGlassVrmControlPanel.tsx](../../../sincromisor-frontend/src/pages/lookingGlassVrm/react/lookingGlassVrmControlPanel.tsx)
- [coreSettingsPages.tsx](../../../sincromisor-frontend/src/features/settings/react/pages/coreSettingsPages.tsx)

## 確認方法

`npm --prefix sincromisor-frontend run build` と、移動した initialCalibrationRetryCard / initialCalibrationProductionBridge / panelCameraGuideState の既存テストを実行する。開発環境で3ページの設定パネルが開き、タイトル・初期カテゴリ・入力表示を維持することを一度確認する。確認手段は既存の playwright-cli スキルに従う。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

共通パネルの所有先と起動入口の参照先を同期する。公開URLと設定名は維持する。

- [app-shell.md](../../../documents/design/frontend/app-shell.md)
- [pages.md](../../../documents/design/frontend/pages.md)
- [settings-design.md](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)

## 実装と確認結果

共通パネル・フック・型・部品・既存テストを `app/settings/react` へ移動し、ページ名を含む共通シンボルを `Sincro` へ改称した。3ページの入口はタイトルと表示構成だけを指定する。較正の所有権や表示条件は維持した。参照する設計とタスク文書のリンクを同期した。

- ビルド: PASS。
- initialCalibrationRetryCard / initialCalibrationProductionBridge / panelCameraGuideState: 3ファイル11テスト PASS。
- Biome: PASS。コメント点検: PASS。
- ブラウザー: 3ページで開始前設定から開始し、メニューから共通パネルを開けることを確認。通常・360度は会話、Looking Glassは専用カテゴリと数値入力を表示した。実機メディア・RTC・360度動画配信は環境にないため、対応する取得エラーは残る。
