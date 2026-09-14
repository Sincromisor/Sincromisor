# VRMの診断結果をコールバックでアプリへ返す

## 背景・目的

`VRMCharacterManager`が`DebugConsoleManager`の共有インスタンスへ毎フレームの結果とプロファイルを直接書き込む。描画処理を診断管理の生成や共有状態から切り離す。

元候補: `work/frontend-refacter.md` の番号3。優先度: 高。作業経路: 統合変更。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] `VRMCharacterManager`が`DebugConsoleManager`をimport・取得せず、診断未接続でも姿勢を計算・適用できる。
- [x] プロファイル、姿勢変換結果、合成要約・詳細が全ページの現在の診断経路へ届き、motion-debugの記録で欠落しない。

## 変更範囲・方針

- 既存の`onThumbnailLoaded`と同様に、VRM管理の設定引数へプロファイルと動作診断を返す小さなコールバックを渡す。結果型はキャラクター層の既存型を利用する。
- 通常ページのアプリ接続処理と独立したmotion-debugの入口で診断管理へ接続する。通常・360度・Looking Glassへ設定引数を伝え、VRM管理内で診断管理を取得する代替処理は残さない。
- 既存の通知順序と診断側の複製処理を維持する。表情ログと姿勢設定の操作は別タスクに残す。

対象外: 診断の保存形式・頻度・複製方式変更、共有状態管理全体の置換、表情ログ分離、姿勢設定の正本移動。

主な参照元・変更箇所:

- [vrmCharacterManager.ts](../../../sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts)
- [vrmScene.ts](../../../sincromisor-frontend/src/character/scene/vrmScene.ts)
- [sincroVrmInitializer.ts](../../../sincromisor-frontend/src/character/scene/sincroVrmInitializer.ts)
- [sincroVrm360Initializer.ts](../../../sincromisor-frontend/src/character/vrm360/sincroVrm360Initializer.ts)
- [sincroLookingGlassVrmInitializer.ts](../../../sincromisor-frontend/src/character/lookingGlass/sincroLookingGlassVrmInitializer.ts)
- [motionDebugSceneRuntime.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugSceneRuntime.ts)
- [sincroAppControllerRuntime.ts](../../../sincromisor-frontend/src/app/bridges/sincroAppControllerRuntime.ts)

## 依存関係

- [本番の姿勢合成サービスの名前と説明を整理する](../task-260914172951-rename-production-pose-composer/task.md) の完了後に着手する。

既存の[切り戻しフック削除](../../character-sincro-motion/task-260712044933-remove-semantic-finger-rollback-hook/task.md)は別目的であり、必須依存にしない。本タスクは着手時点で存在するフラグと抑制条件を維持し、先に削除済みなら復活させない。同じファイルの変更を並行実施しない。

## 確認方法

- `armBoneController.test.ts`と`debugConsoleSincroMotionControls.test.ts`を対象実行する。通知なしでも適用できる条件と通知内容を最小の確認で補う。
- 通常ページの診断更新とmotion-debugの記録に結果が届くことを各1回確認する。360度・Looking Glassは接続処理の結合確認で引数の伝播を確認し、実機網羅は要求しない。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。

## 文書同期

- [app-shell.md](../../../documents/design/frontend/app-shell.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。
- [overview.md](../../../documents/design/frontend/character/overview.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

任意の診断コールバックをVRM管理とシーンへ追加し、通常・360度・Looking Glassはアプリ窓口、motion-debugは独立ページから既存の診断管理へ接続した。通知順序と受信側の複製を維持し、設計とコメントを同期した。

- 姿勢適用・診断の対象テスト10件、3ページと独立ページの接続テスト、記録制御テストが成功した。診断未接続でも姿勢を適用できる。
- Biomeと型確認を含む本番ビルドが成功した。
- 通常ページの診断更新と、motion-debugの記録用スナップショットにプロファイル・適用済み合成結果・最終姿勢が届くことをブラウザーで確認した。RTC・カメラは開始せず、360度・Looking Glassの実機確認は未実施。
- コメント点検: PASS。既知の残リスクはない。
