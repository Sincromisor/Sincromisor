# キャラクター選び直し後のモデル反映と再開始を修正する

## 背景・目的

常設設定の「キャラクターを選び直す」はRTCを停止して起動前ダイアログを開く。一方、SincroVRMInitializer.startUiSideEffectsOnceは初回開始後に戻るため、再開始時にダイアログを閉じず、新しいVRMも読み込まない。2026-11-14のレビューで、開始・停止・ダイアログ再表示・開始の順に操作すると、初回だけ閉じ、再開始後は開いたままになることを再現した。

## 完了条件

- [ ] 同じモデルでの再開始はシーンを重複生成せず、開始成功時に起動前ダイアログを閉じる。
- [ ] 別モデルの選択確定後に開始すると、表示モデル・サムネイル・設定画面の状態が選択したモデルに一致する。
- [ ] モデルの交換は既存シーンとレンダラーを保持し、VRMCharacterManagerが旧モデルとモデル固有制御を置き換える。旧モデルのGPU資源は不要になってから解放する。
- [ ] 新しいモデルの読込が失敗した場合は旧モデルを保持し、選択モデルの反映失敗と再試行手段を画面へ示す。古い読込結果が新しい選択を上書きせず、不採用結果の資源も解放する。
- [ ] Character無効で初回開始した後、有効にして再開始した場合は初めてシーンを生成する。通常のRTC停止・再開、較正の中断・開始、3ページの固有設定を維持する。

## 設計判断・依存関係

初回シーン生成と毎回の開始成功時のダイアログ終了を分離する。モデル交換の要求は初期化処理からシーンへ渡し、読込世代・モデル資源の所有者はVRMCharacterManagerとする。モデル交換だけを理由としたページ再読込やXR・レンダラー全体の作り直しは行わない。

[独立レビュー](review.md)の補完に従い、交換時は現在世代のモデル交換成功までダイアログを保持する。読込と反映を分け、失敗時は旧モデルと制御処理を保持する。保存済み選択と表示中モデルの違いを画面へ示す。サムネイルの読込・canvas.toBlobも世代検査し、サムネイルのない新モデルには既定アイコンを使う。

先に[復元完了待ち](../task-261114152035-await-vrm-restore-before-start/task.md)と[Blob URLの所有・解放](../task-261114152036-release-vrm-selection-object-urls/task.md)を完了する。Blob URLは選択側が所有し、本タスクは読込中の利用完了を通知する。GPU資源の解放とURLの解放を混同しない。

読込世代・3D資源・開始制御の生存期間をまたぐ高リスク変更として独立レビュー・評価を行う。モーション推定方式、RTC停止の機器範囲、保存形式は変更しない。

## 主な変更箇所

- [初期化処理](../../../sincromisor-frontend/src/app/bootstrap/sincroVrmInitializer.ts)と360度・Looking Glassの派生初期化処理
- [シーン](../../../sincromisor-frontend/src/character/scene/vrmScene.ts)、[モデル管理](../../../sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts)
- [選び直し操作](../../../sincromisor-frontend/src/app/settings/react/sincroSettingsPages.tsx)、ダイアログ・アプリの状態通知

## 確認方法

同一モデル再開始、AからBへの交換、Bの読込失敗、読込順序逆転、初回Character無効からの有効化を対象に、ダイアログ状態・モデル識別・生成／解放回数を確認する。既存の初期化・シーンテストを再利用し、Chromeでは共有可能なVRM固定素材を使って通常ページで選択から表示まで確認する。3ページの初期化設定は既存の結合テストで確認し、Looking Glass実機の網羅試験は要求しない。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の該当する責務・挙動を同期する。外部RTC契約は変更しない。
