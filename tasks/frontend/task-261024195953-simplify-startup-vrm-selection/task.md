# 起動前のVRM選択を一つの操作領域にまとめる

## 背景 / 目的

2026-10-24、HEAD `30ce9259`の起動前概要では、「キャラクター」「VRM-1.0 モデル」「VRM ファイルを選択」「VRMファイルをここにドラッグ&ドロップ」「既定のVRMモデルを使用中」が連続する。選択ボタンとドロップ枠が別々で、同じ対象の説明が重なる。

ユーザーの原則に従い、現在のキャラクターと交換操作の関係を一つの領域で伝える。

## 完了条件（受け入れ条件）

- [x] 現在モデルの状態とファイル選択・ドロップによる交換を一つのまとまりに置く。VRM 1.0形式は短い表記で確認でき、同じ対象の見出し・説明を重ねない。
- [x] 通常時の「ここにドラッグ&ドロップ」という文章だけに依存せず、選択操作とドロップ対象が境界・配置から分かる。ドラッグ中は受け入れ先が視覚的に分かる。
- [x] 既定モデル・保存モデル・選択ファイル名・読込失敗や拒否理由を既存状態に従って識別できる。
- [x] 概要と詳細が同じ操作を使い、クリック・キーボードでの選択と既存のドロップが動く。狭幅でも長い名前やエラーで開始操作を隠さない。

## 設計判断

既存の選択窓口とドラッグ状態を使い、選択ボタンを操作領域内へ組み込む。文章だけの案内枠を独立させない。モデル一覧・サムネイル生成などの新機能は追加しない。

## スコープ境界

起動前のモデル選択部分とCSSが対象。VRMの検証・保存・読込処理、対応形式、常設側から起動前へ戻る動作は維持する。

## 実装方針

- [モデル選択部品](../../../sincromisor-frontend/src/features/dialog/react/components/dialogSettingsSections.tsx)の`VrmModelSection`と`DialogVrmDropStatusCard`を一つの操作領域として組み直す。
- [起動前概要](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogOverview.tsx)、[起動前詳細](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogSettingsPages.tsx)と[起動前CSS](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogSettings.css)へ反映する。
- [ドロップ処理](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogVrmDragDrop.ts)、[ファイル選択](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogVrmFilePicker.ts)と[モデル状態](../../../sincromisor-frontend/src/features/dialog/model/dialogVrmWorkflowService.ts)を再利用する。ダイアログ全体が持つ既存のドロップ受付を狭めない。

## テスト

変更対象の静的検査と型検査・ビルドを行う。`playwright-cli`で概要と詳細の表示、キー操作での選択、VRMの選択とドロップ、非対応ファイルの拒否を確認する。通常幅と狭幅でモデル状態・長い名前・エラーが読めることを確認する。既存のVRM選択確認を使う。

## ドキュメント同期の要否

[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)と[設定項目一覧](../../../documents/design/frontend/setting-and-debug-ui/settings-items.md)の起動前キャラクター選択の構成を同期する。VRM保存形式・通信契約は変更しない。

## 実施結果

概要・詳細で共有するVRM選択を、形式・選択ボタン・モデル状態を含む一つの破線枠へ統合した。通常のドロップ説明を除き、ドラッグ中に枠と案内を強調する。状態文は既存所有者から受け取り、ダイアログ全体のドロップ受付を維持した。対象Biome、ビルド、既存VRM初期化のVitest（2件）、Playwright CLIで概要・詳細の1440px/390px、既定・選択ファイル・保存モデル、Enterからの選択とクリック、ファイル選択・ドロップ・非対応拒否、長い名前の折り返しと固定開始操作を確認した。VRM検証・読込・保存処理は変更していない。

文書・コメント点検はPASS。専用のローカルViteを使用し、接続先未起動によるRTC設定取得失敗はUI確認に影響しない。
