# 表情制御のログ出力をコールバックへ分離する

## 背景・目的

`FaceEmotionController`はログを残すためだけに`DebugConsoleManager`を保持している。表情制御を診断管理から独立させる。

元候補: `work/frontend-refacter.md` の番号3。優先度: 中。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] `FaceEmotionController`に`DebugConsoleManager`への実行時依存がない。
- [x] 同一message_idの再適用抑制、口形と表情の競合回避、感情強度と表示ログが変わらない。

## 変更範囲・方針

- `FaceEmotionController`へログ文字列を受け取るコールバックを渡し、既存の初期化・表情適用・利用可能表情のログをそのまま送る。
- 先行タスクの診断接続へ小さく追加し、アプリ／motion-debug側で既存のテキストログへ接続する。コールバックがない場合も表情制御は動く。

対象外: 感情対応表や強度の変更、音声・会話プロトコル変更、別のログ基盤追加。

主な参照元・変更箇所:

- [faceEmotionController.ts](../../../sincromisor-frontend/src/character/behavior/faceEmotionController.ts)
- [vrmCharacterManager.ts](../../../sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts)
- [vrmScene.ts](../../../sincromisor-frontend/src/character/scene/vrmScene.ts)

## 依存関係

- [VRMの診断結果をコールバックでアプリへ返す](../task-260914172951-decouple-vrm-diagnostics/task.md) の完了後に着手する。

## 確認方法

- 既存の表情テストがあれば対象実行する。なければ表情適用とログ通知の最小テストを1つ追加し、診断管理を生成せず確認する。
- 先行タスクで使うアプリ接続確認に表情ログ1件の到達を加える。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [overview.md](../../../documents/design/frontend/character/overview.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

表情制御の診断管理への依存を除き、任意のログコールバックへ置き換えた。通常アプリとmotion-debugの診断接続が既存テキストログへ転送する。

- 対象3テストで同一メッセージの再適用抑制、口形との重複除去、強度、未接続時の表情制御、通常・独立ページのログ到達を確認した。
- Biomeと型確認を含む本番ビルドが成功した。設計同期・コメント点検: PASS。既知の残リスクはない。
