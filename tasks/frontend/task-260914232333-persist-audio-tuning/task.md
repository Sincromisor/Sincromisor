# 音声デバッグ調整を保存して再読込後に復元する

## 背景 / 目的

WebUIで変更した項目の保持を、通常設定とは別経路にある音声デバッグ調整へ拡張する。
調査基点は `d3031df5`。`DebugConsoleAudioControls` は診断モデルとコールバックへ調整を渡すが保存しない。起動時は `SincroAudioInputController` が音声処理から診断表示を初期化するため、表示だけ復元しても実効値は保持されない。
[全設定の初期化](../task-260914232327-reset-webui-settings/task.md)まで完成した保存基盤を使う。

## 完了条件

- [ ] [音声の調整項目](../../../documents/design/frontend/setting-and-debug-ui/debug-items.md)にあるフィルター、VAD方式、RMS閾値、学習VADのプリセット・厳格判定・数値調整をページ別に保持する。
- [ ] 再読み込み後、診断UIと音声処理に同じ調整が反映される。通常設定を先に復元し、調整コールバック接続後、音声取得・会話開始前に音声調整を復元する。
- [ ] プリセットに続けて手動調整した状態を復元できる。連続判定フレーム数など再現に必要な値も保持し、入力刻みへの丸め直しでプリセット値を変えない。
- [ ] 会場プリセットのオン・オフと個別調整の前後関係を維持する。個別調整でプリセットを解除した状態が保存され、その後プリセットを選び直した場合は古い調整が次回復元で逆戻りさせない。
- [ ] 音量・検出結果・統計の通知や初期同期だけでは保存しない。利用者による調整と、それに付随するプリセット変更を保存する。
- [ ] 不正な保存値・保存失敗は通常設定と同じ方針で扱い、「全て初期設定に戻す」で音声調整も削除される。

## 変更範囲と方針

[音声調整窓口](../../../sincromisor-frontend/src/features/debug/model/debugConsoleAudioControls.ts)、[音声との接続](../../../sincromisor-frontend/src/app/controller/sincroAudioInputController.ts)、[音声プロファイル](../../../sincromisor-frontend/src/features/media/userMedia/userMediaAudioProfiles.ts)、既存の設定保存層を対象とする。
必要な調整値だけを保存し、診断スナップショット全体や音声・推論結果は保存しない。形式・検証は既存の小さな保存処理へ追加する。
音声・VADのアルゴリズム、プリセット既定値、通信契約は変えない。視線・姿勢の保持は[別タスク](../task-260914232333-persist-tracking-tuning/task.md)が担当する。

## 確認方法と文書同期

既存の調整コールバックを通した復元、プリセット後の手動調整、会場プリセット選び直しと再復元、初期化による削除を対象テストで確認する。
開発ブラウザーで代表的な音声調整を変更・リロードし、UIと実効設定の一致を確認する。音声認識精度の比較や長時間計測は不要。
変更範囲の静的検査とフロントエンドの型確認・ビルドを行う。
[デバッグUI設計](../../../documents/design/frontend/setting-and-debug-ui/debug-design.md)、音声項目一覧、[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の保存対象・プリセット優先順位・全設定初期化を同期する。
