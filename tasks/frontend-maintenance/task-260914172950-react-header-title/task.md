# ヘッダーの題名をReactの設定購読へ統一する

## 背景・目的

Reactが生成したヘッダーの題名を`DialogManager`が`HeaderTitleDomAdapter`経由で書き換えている。題名の描画を既存の設定購読へ統一し、モデルからDOM構造への依存をなくす。

元候補: `work/frontend-refacter.md` の番号5。優先度: 中。作業経路: 通常変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 題名の初期値と起動前後の変更がReact経由で表示される。
- [x] 題名への`querySelector`／`innerText`更新がなくなり、空文字の既定値と有効制御処理差し替え時の購読が維持される。

## 変更範囲・方針

- `SincroShellHeader`で既存の設定購読を利用し、`titleText`を文字列として描画する。
- 空文字をSincromisorへ補正するモデル側の規則を保持し、`updateTitleText`と不要なDOMアダプターを削除する。呼び出し元と既存テストも追従させる。

対象外: 新しい状態管理、題名以外のダイアログ再設計、起動順序の変更。

主な参照元・変更箇所:

- [sincroPageAppShell.tsx](../../../sincromisor-frontend/src/app/shell/sincroPageAppShell.tsx)
- `headerTitleDomAdapter.ts`（本タスクで削除）
- [useSincroAppControllerSettingsState.ts](../../../sincromisor-frontend/src/app/react/useSincroAppControllerSettingsState.ts)
- [dialogManager.ts](../../../sincromisor-frontend/src/features/dialog/model/dialogManager.ts)

## 依存関係

先行タスクなし。

## 確認方法

- 既存の`dialogSettingsAccess.test.ts`、`sincroAppSettingsStore.test.ts`を対象実行する。
- 開発サーバーのsimple-vrmで初期題名、題名変更、空文字を1回ずつ確認する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [app-shell.md](../../../documents/design/frontend/app-shell.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

ヘッダーを既存の設定購読へ接続し、DOMアダプターと題名直接更新を削除した。空文字補正と一括通知を維持し、設計と関連コメントを同期した。

- 対象テスト2件、変更ファイルのBiome、型確認を含むビルドが成功した。
- simple-vrmのブラウザーで初期値、ダイアログ開閉前後の題名変更、文字列描画、空文字補正、有効制御処理の差し替えを確認した。RTC接続は対象外で、開発環境の設定APIは未配置。
