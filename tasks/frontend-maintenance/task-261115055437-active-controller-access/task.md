# 有効アプリの参照と購読を軽量な窓口へ分離する

## 背景 / 目的

優先度: 高。開発体験の調査に基づき、現在値取得・購読だけでRTC・音声・追跡の実装まで静的に読み込む依存を解消する。現状は `subscribeActiveSincroAppController.ts` が `SincroAppController` 本体を参照し、有効アプリの保持先も同クラスの静的フィールドにある。

## 変更範囲と方針

- [有効アプリの保持処理](../../../sincromisor-frontend/src/app/controller/sincroAppActiveControllerRegistry.ts)、[アプリ制御](../../../sincromisor-frontend/src/app/controller/sincroAppController.ts)、[購読関数](../../../sincromisor-frontend/src/app/controller/subscribeActiveSincroAppController.ts)を対象にする。
- 既存の保持処理を再利用し、現在値取得と購読を独立モジュールから公開する。Controllerへの参照は型専用とし、同じ保持先をControllerと購読関数が使う。
- 書き込みは引き続きアプリ制御が行う。既存の静的取得・購読メソッドは後続の利用側移行まで同じ保持先へ委譲する。
- 現在値の即時通知、差し替え前の旧購読解除、同一インスタンス再指定時の扱い、解除時の `camera-quality-reset` 通知順を維持する。機器・シーンの生成や終了は変更しない。
- UI側の一括移行は [画面と購読フックを軽量なアプリ参照窓口へ移行する](../task-261115055437-ui-controller-imports/task.md) に分ける。汎用の依存注入機構や状態管理ライブラリーは追加しない。

## 完了条件

- [x] 新しい現在値取得・購読窓口を実行時に読み込んでも、Controller本体と実行時サービスの組み立てモジュールへ静的依存が到達しない。
- [x] Controller、既存静的メソッド、購読関数が同じ現在値を返し、登録・差し替え・解除の通知と解除回数が変わらない。
- [x] 既存利用側のまま型検査と関連テストが通る。

## 確認方法

フロントエンドで型検査、変更ファイルのBiome、`src/app/controller/__tests__/sincroAppController.test.ts` を実行する。窓口の単独インポートを確認し、実行時モジュールへ到達しないことを静的依存の追跡で確かめる。通知順の既存試験で不足する部分だけ小さく補う。速度の数値目標は設けない。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)の有効アプリ参照と購読の入口を更新する。通信・保存契約とサービスの所有権は変更しない。

## 実施結果

共有レジストリーをモジュールへ移し、`activeSincroAppController.ts`に読み取り・購読窓口を追加した。Controllerの静的メソッドと購読補助関数は同じ保持先を参照する。書き込みと解除前のカメラ品質通知はControllerに残した。

型検査、変更ファイルのBiome、Controllerと窓口の2試験が成功した。現在値の共有、即時通知、同一インスタンス再指定、差し替え時の解除回数、登録解除時の通知順を確認した。窓口と購読補助関数の実行時依存は共有レジストリーだけで、Controllerは型専用参照である。単独インポート試験でもController・実行時組み立てへの到達がないことを確認した。共通枠組みの設計とコメントを点検・更新した。
