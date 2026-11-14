# VRM復元完了後に手動・OBSの開始を許可する

## 背景・目的

DialogManagerはコンストラクターからVRM復元を開始するが、その完了を公開しない。SincroVRMInitializer.bootstrapは同期的な初期化の直後にOBS自動開始へ進むため、復元が未完了でも既定モデルのシーンを生成する。2026-11-14のレビューではCache Storageの応答を保留する条件で、既定モデルの要求が先行することを再現した。

## 完了条件

- [ ] 手動・OBSとも、VRM復元の成功または失敗時の処置が確定してからシーンを開始する。復元前に既定モデルを読み込まない。
- [ ] 保存済みVRMがあれば、そのURLを最初のシーン生成へ渡す。保存なしなら既定モデルを使い、復元失敗なら失敗と既定モデルで開始できることを画面へ示す。
- [ ] 待機中は開始準備中であることを示す。複数の開始操作で複数のシーン・RTC接続を生成せず、停止・体験終了・アプリ解除後に遅れて自動開始しない。
- [ ] 復元中の利用者によるVRM選択は受け付けないことをUIと操作窓口で保証し、復元完了後に選択可能にする。選択の保存処理中も、その選択が確定する前に開始しない。
- [ ] 3ページ共通の起動順序と、ページ既定値・保存設定・URL設定の優先順位を維持する。

## 設計判断・範囲

初期復元の完了状態はダイアログのVRM選択処理が所有し、開始可否と開始要求の有効性はアプリ制御が判断する。復元待機と開始要求を別に扱い、初期復元に開始副作用を持たせない。OBSの開始要求も同じ経路へ接続する。

[独立レビュー](review.md)の補完に従い、待機中は機器・RTC・較正を始めない。停止・終了では、現在のidle・機器未使用による早期returnより先に待機中の開始要求を無効化する。取消しは共有される復元結果の保存まで破棄しない。

複数所有者の非同期処理を扱うため高リスク変更として独立レビュー・評価を行う。モデルの再選択反映、Blob URL解放、通信契約や保存形式の変更は本タスクに含めない。ブラウザーが終了しない限り待ち続ける独自の時間切れ仕様は追加せず、既存処理の結果と取消しを扱う。

## 主な変更箇所

- [DialogManager](../../../sincromisor-frontend/src/features/dialog/model/dialogManager.ts)、[VRM選択制御](../../../sincromisor-frontend/src/features/dialog/model/dialogVrmStateController.ts)、[選択状態](../../../sincromisor-frontend/src/features/dialog/model/dialogStateStore.ts)
- [初期化処理](../../../sincromisor-frontend/src/app/bootstrap/sincroVrmInitializer.ts)、[開始・終了制御](../../../sincromisor-frontend/src/app/controller/sincroAppLifecycleController.ts)、関連するアプリ窓口・設定画面

## 確認方法

復元Promiseを保留・成功・失敗させ、開始前のVRM URLとシーン生成回数、待機中の停止後の生成抑止を単体または結合テストで確認する。選択保存待ちの開始抑止も確認する。[起動テスト](../../../sincromisor-frontend/src/app/bootstrap/__tests__/vrmInitialization.test.ts)を更新し、3ページの既存確認を維持する。ChromeではCache Storage応答を遅延させた本番起動経路で、準備中表示と最初のモデル要求URLを確認する。実マイク・カメラの取得は不要とする。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の該当する責務・挙動を同期する。外部RTC契約は変更しない。
