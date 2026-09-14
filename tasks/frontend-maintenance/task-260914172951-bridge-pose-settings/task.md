# 姿勢設定とシーンの接続をアプリ側へ集約する

## 背景・目的

`SincroVRMInitializer`は診断管理から設定を読み、診断画面の操作コールバックを登録してシーンへ渡す。設定の正規化と所有は維持しながら、この配線を既存のアプリ窓口へ集約する。

元候補: `work/frontend-refacter.md` の番号3。優先度: 中。作業経路: 高リスク変更（アプリとシーンの購読の生存期間）。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [ ] 初期化処理が診断管理を直接取得せず、既存のアプリ窓口から設定と変更を受け取る。
- [ ] シーン生成前の設定、生成後の強度変更、診断側操作が正規化後の同じ値を適用し、通知が循環しない。
- [ ] 有効アプリ差し替え・繰り返し解除で旧シーンへ設定を送らず、新しい接続は維持される。

## 変更範囲・方針

- 既存アプリの操作窓口に、姿勢設定の取得・反映・変更接続の必要最小限の操作を追加し、初期化処理から`DebugConsoleManager`への直接参照を除く。設定値は現行の診断モデルを正本とし、新しいストアや複製した設定正本は作らない。
- 設定正規化後の値をシーンへ渡す。通常設定の強度変更と診断側操作のそれぞれが1経路で適用され、設定通知を再入力して循環しないようにする。
- 操作コールバックの登録・解除は有効アプリが所有する。既存の`releaseEventSubscriptions`へ接続し、古い解除が新しい登録を消さない条件を維持する。独立ページmotion-debugの明示適用はそのページの所有とする。

対象外: 設定正本の移動、全デバッグAPIのアプリ移行、RTC・カメラの開始停止変更、切り戻しフラグ削除。

主な参照元・変更箇所:

- [sincroVrmInitializer.ts](../../../sincromisor-frontend/src/character/scene/sincroVrmInitializer.ts)
- [sincroAppBridges.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppBridges.ts)
- [sincroAppControllerRuntime.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppControllerRuntime.ts)
- [sincroAppController.ts](../../../sincromisor-frontend/src/app/controller/sincroAppController.ts)
- [debugConsoleManager.ts](../../../sincromisor-frontend/src/features/debug/model/debugConsoleManager.ts)
- [debugConsoleSincroMotionControls.ts](../../../sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionControls.ts)
- [motionDebugApp.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts)

## 依存関係

- [VRMの診断結果をコールバックでアプリへ返す](../task-260914172951-decouple-vrm-diagnostics/task.md) の完了後に着手する。

既存の[切り戻しフック削除](../../character-sincro-motion/task-260712044933-remove-semantic-finger-rollback-hook/task.md)は別目的であり、必須依存にしない。本タスクは着手時点で存在するフラグと抑制条件を維持し、先に削除済みなら復活させない。同じファイルの変更を並行実施しない。

## 確認方法

- `sincroAppController.test.ts`と`debugConsoleSincroMotionControls.test.ts`を対象実行し、実際の接続処理を使って設定到達・差し替え・繰り返し解除を確認する。
- 通常ページで設定パネルと診断画面から強度を変更し、シーンへの反映を各1回確認する。motion-debugの既存設定操作も1回確認する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。
- 起票時に独立レビューを行う。実装時は高リスク変更の手順に従い、独立評価と `npm run gate` に加えて上記の接続確認を行う。

## 文書同期

- [app-shell.md](../../../documents/design/frontend/app-shell.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。
- [overview.md](../../../documents/design/frontend/character/overview.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。
