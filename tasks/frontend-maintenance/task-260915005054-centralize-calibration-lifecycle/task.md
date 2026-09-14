# 較正を含む開始停止と設定変更をアプリ制御へ集約

## 背景 / 目的

useSimpleVrmPanelState は開始時に較正を開始し、モード・カメラ・VRM変更時に較正を中断する。一方、起動前ダイアログとOBS自動開始は AppController.start を直接呼ぶ。操作の入口で較正処理が異なり、VRM変更の判定も表示文言に依存している。これは静的調査で確認した経路差であり、実機での不具合再現は未実施。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 高。作業区分: 高リスク変更（較正とアプリの状態遷移・購読所有者を変更）。

先行: [共通設定パネルをページ固有領域からアプリ層へ移動](../task-260915005054-relocate-shared-settings-panel/task.md)。先行タスクが移したファイルは移動先を参照する。

## 完了条件（受け入れ条件）

- [x] ダイアログ、設定パネル、OBSの開始が同じアプリ操作を通り、受理された sincro モードの開始だけが較正を開始する。chat モードや重複開始では較正を新設しない。
- [x] 既存の接続停止操作、カメラ変更・追跡停止、sincro モード離脱、VRM選択変更、有効アプリ解除で、そのアプリが所有する有効較正を中断する。
- [x] 設定パネルは較正状態の購読と再試行要求に専念し、VRM変更を vrmStatusText の比較で判定しない。
- [x] 旧アプリの購読解除・遅延結果が新しい較正を変更せず、既存の sessionId と段階別再試行の保護、Pose観測時刻による継続時間計測を維持する。

## 設計判断

アプリ層が開始・中断・再試行の窓口と接続解除を所有し、既存の InitialSincroCalibrationController と PoseBridge の評価を再利用する。開始は AppController の重複抑止後に行う。開始中の同期例外、カメラ取得失敗、追跡初期化・実行の非同期失敗で、その開始に紐づく較正を中断する。視線制御が現在内部で捕捉する非同期失敗と追跡終了を、既存のアプリ接続に小さい結果通知として返す。通知はアプリと追跡開始の世代に紐づけ、古い開始結果で新しい較正を中断しない。音声取得・RTCだけの失敗ではカメラ追跡が継続し得るため、較正の中断条件には追加しない。VRMのキャッシュ初期復元と利用者による選択変更を区別する内部通知を使う。カメラの既定機器への復帰（明示的な undefined）も変更として扱う。

## スコープ境界

先行タスク後の共通パネル、ダイアログ操作、AppController と視線制御、VRM選択通知、較正接続を変更する。RTC停止をカメラ停止へ拡張するなど、既存停止操作のリソース範囲は変えない。較正の判定閾値・段階構成・保存形式は対象外。

## 実装の参照先

- [useSimpleVrmPanelState.ts](../../../sincromisor-frontend/src/app/settings/react/useSincroPanelState.ts)
- [configurationDialogActions.ts](../../../sincromisor-frontend/src/features/dialog/react/configurationDialogActions.ts)
- [sincroAppController.ts](../../../sincromisor-frontend/src/app/controller/sincroAppController.ts)
- [sincroCharacterGazeController.ts](../../../sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts)
- [dialogVrmStateController.ts](../../../sincromisor-frontend/src/features/dialog/model/dialogVrmStateController.ts)
- [initialSincroCalibrationController.ts](../../../sincromisor-frontend/src/character/calibration/initialSincroCalibrationController.ts)
- [initialSincroCalibrationPoseBridge.ts](../../../sincromisor-frontend/src/character/calibration/initialSincroCalibrationPoseBridge.ts)
- [sincroVrmInitializer.ts](../../../sincromisor-frontend/src/app/bootstrap/sincroVrmInitializer.ts)

## 確認方法

既存の initialCalibrationProductionBridge / initialSincroCalibrationController / sincroAppController のテストを利用し、実際のアプリ窓口を通す開始・中断・差し替えの結合確認を追加する。機器取得だけを代替し、ダイアログ・パネル・OBSの入口が同じ較正へ接続されること、同期例外・カメラ取得拒否・追跡初期化失敗・古い開始結果・重複開始と旧解除を確認する。音声またはRTCだけの失敗で較正を中断しないことも確認する。開発環境で sincro 開始から較正表示・中断を一度確認する。高リスク変更の独立評価と全体確認はタスク管理の作業経路に従う。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

「パネルが較正の開始・中断を担う」現行契約をアプリ所有へ変更したことと、全開始入口への影響を明記する。通信契約は変更しない。

- [app-shell.md](../../../documents/design/frontend/app-shell.md)
- [tracking.md](../../../documents/design/frontend/character/tracking.md)
- [settings-design.md](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)

## 実装と確認結果

アプリ専用の較正管理を追加し、重複抑止後の開始、既存のRTC停止、設定適用結果、利用者のVRM選択とアプリ解除を接続した。Pose評価先も同じアプリの較正へ明示的に渡す。共通パネルは状態購読と再試行だけを担い、VRM表示文言の購読を削除した。カメラ取得・追跡初期化・各観測・失敗・映像終了は開始世代で検査し、旧アプリの購読と結果反映を解除する。

- ビルド: PASS。全体テスト: 638件 PASS（既存の2件スキップ）。
- 実際のアプリ・中核・視線制御を通す結合確認: 同期失敗、音声不通、RTC単独失敗、カメラ拒否、追跡初期化・実行失敗、映像終了、既定カメラ復帰、モード離脱、追跡停止、VRM選択、再開始、旧取得・旧初期化結果、旧フレーム、旧解除を確認した。
- 既存の3ページ起動テストで、OBSと手動開始時の較正開始、chat除外、重複開始抑止を確認した。既存のPose評価・再試行テストもPASS。
- ブラウザー: カメラ取得だけを保留し、起動前ダイアログからsincro開始、共通パネルの事前確認表示、接続停止による表示解除を確認した。実機カメラの段階完了は未確認。
- 全体ゲート: 既存Markdownの整形不一致で停止。今回変更したMarkdownは整形済み。Biomeの既存の複雑度等の助言は追加分を対象点検した。
- 構造検査: failures=0。コメント点検: PASS。

独立評価: PASS（対象7ファイル19テスト）。
