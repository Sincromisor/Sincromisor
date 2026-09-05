# ダイアログ設定の読み書きと個別転送を整理

## 背景 / 目的

設定値は `DialogStateStore` に集約されているが、各項目に `DialogManager` の取得・設定メソッド、`Facade`、適用時の分岐、スナップショット生成時の列挙が必要になっている。

根拠はフロントエンドの肥大化レビューに対する改善タスク起票のユーザー要求である。起票時の確認基点は `75ebbdb4d562dfefbd5cbd887e121a8a0b9cc3bb`。実装着手時に現在のコードと呼び出し元を再確認する。

## 完了条件

- [x] 既存の型付き設定を利用し、副作用を持たない設定の読み書きで項目ごとの転送メソッドを増やさずに済む形へ整理する。
- [x] 移行対象の全利用箇所を更新し、不要になった個別取得・設定メソッド、型の再列挙、文字列からキーへの不要な変換を削除する。
- [x] 操作不可の設定は変更しない規則、数値の正規化、機器選択に伴う表示更新、空の題名の補正、会話モード反映を維持する。
- [x] 一括更新後の設定値と変更通知が従来の利用箇所で利用できる。

## 変更範囲と方針

正本は既存の `DialogStateStore` に置く。読み取りと更新の内部APIを整理し、状態管理ライブラリや汎用設定生成機構は追加しない。Looking Glass独自設定、React購読方式、通知キャッシュの変更は含めない。副作用のある設定は明示処理を残す。

- [dialogStateStore.ts](../../../sincromisor-frontend/src/features/dialog/model/dialogStateStore.ts)
- [dialogManager.ts](../../../sincromisor-frontend/src/features/dialog/model/dialogManager.ts)
- [dialogBooleanSettings.ts](../../../sincromisor-frontend/src/features/dialog/model/dialogBooleanSettings.ts)
- [sincroAppDialogFacade.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppDialogFacade.ts)
- [sincroAppSettingsApply.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsApply.ts)
- [sincroAppSettingsSnapshotBuilder.ts](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsSnapshotBuilder.ts)

## 依存タスク

なし。単独で着手できる。

## 確認方法

- `enableVadGate` 等の通常設定、操作不可設定、機器IDの `undefined` 指定、数値正規化を対象に小さな回帰テストを追加または更新する。
- 起動前ダイアログと起動後設定で同じ設定値を読み書きできることを一度確認する。
- `sincromisor-frontend` で `npm run build` を実行する。変更したソースの整形・静的検査は対象ファイルに限定する。
- 実行コマンド、確認結果、未実行項目と理由を本書に追記する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定・診断画面](../../../documents/design/frontend/settings-and-debug-ui.md)の該当記述を実装に合わせ、[設計索引](../../../documents/design/index.md)の導線を確認する。通信形式、公開URL、保存形式の変更は含めない。

## 実施結果

設定の適用・利用箇所・設計文書を同期する統合変更として、現在の作業ツリーで実装した。`DialogStateStore` の型付き部分更新と `DialogManager.getSetting` / `getSettings` / `updateSettings` に集約し、個別の取得・設定メソッドと `dialogBooleanSettings.ts` を削除した。音声・視線の設定型も既存型から取得する形へ変更した。

- `rg` で旧メソッドと文字列変換の実装参照が残らないことを確認した。
- フロントエンドで変更したTSファイルを `npx biome check` に渡して成功した。
- `npm run test -- src/app/controller src/character/behavior src/features/dialog` は3ファイル・8件成功。追加した `dialogSettingsAccess.test.ts` は操作不可設定、通常設定、機器IDの解除、数値の範囲・刻み・非有限値、空の題名、会話モード、機器案内、一括通知、設定コピー、Looking Glassとの分離を確認する。
- `npm run build` は成功。500 kB超の分割ファイル警告は既存構成によるもの。
- 設計2文書を同期し、設計索引からの導線を確認した。変更文書のPrettier確認、文書点検、コメント点検はPASS。

### ブラウザー確認

`npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` で起動し、Playwrightから `/simple-vrm/` を操作した。

1. 起動前ダイアログで題名を「設定共有確認」に変更し、音声の「無音時の送信を抑える」を有効にする。
2. 「開始する」から基本設定パネルを開き、題名と音声設定が維持されることを確認する。
3. 設定パネルで同項目を無効にし、既存のアプリ管理インスタンスの `dialog.open()` で再表示したダイアログでも無効になることを確認する。

バックエンド未起動による `config.json` の404、実機マイク・カメラが利用できないエラーがあるため、実際の音声通信・追跡は未確認。設定UIの読み書きは確認済み。

Reactの `Maximum update depth exceeded` は変更前の `3e40a89b` を `git archive` で一時ディレクトリへ展開し、5174番ポートで同じページを開いて再現した。変更前後とも設定UIは操作できる。React購読方式は本タスクの対象外であり、既存の残課題として記録する。Playwrightのスキルと導入済みコマンドの版の不一致警告も出たが、操作は実行できた。

### タスク管理の確認

`npm run tasks:index:check` は成功。`npm run tasks:check` は変更範囲外の `task-260904005741-fix-face-landmarker-timestamp` に既存の `review.md`・`impl.md`・`eval.md` 欠落があり失敗した。
