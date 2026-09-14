# 視線と姿勢のデバッグ調整を保存して復元する

## 背景 / 目的

WebUIで変更した項目の保持を、視線・姿勢のデバッグ調整へ拡張する。
調査基点は `d3031df5`。視線と姿勢の調整は通常設定と別モデルにあり、保存されない。姿勢強度は通常設定からも変更され、シーン接続時に通常設定の値が渡されるため、復元順序を定めないと診断調整が失われる。
[全設定の初期化](../task-260914232327-reset-webui-settings/task.md)まで完成した保存基盤を使う。

## 完了条件

- [ ] [デバッグ項目一覧](../../../documents/design/frontend/setting-and-debug-ui/debug-items.md)の視線追跡調整・プリセットと姿勢変換の調整入力をページ別に保持する。視線プリセットの `oneEuroDCutoff` など、操作結果の再現に必要な値も含める。
- [ ] 起動後はUIと実際の視線・姿勢処理へ復元される。コールバック接続前・シーン未生成時に復元した値を失わず、開始時に適用する。通常設定の初期反映が診断の保存値を上書きしない。
- [ ] 姿勢強度は通常設定を基準にし、利用者が診断側で変更した場合だけ診断側の保存値を後から適用する。診断操作を通常設定の保存値へ書き戻さない既存の責務を維持する。
- [ ] 診断強度の調整後に通常の「姿勢同期」を操作した場合は、同値の再指定も含め、その操作を優先して診断側の強度上書きを解除する。次回復元で古い診断強度へ戻らない。
- [ ] プリセット値やラジアン値を表示の刻みで丸め直さず再現する。既存の検証・正規化を使い、不正な保存値で追跡や描画の開始を止めない。
- [ ] 計測値、モデル由来の身体寸法、追跡・較正結果、フレームごとの診断通知を保存しない。シーン接続時の同期を利用者操作として保存しない。
- [ ] 「全て初期設定に戻す」で視線・姿勢調整が削除され、通常設定・診断側の既定値から起動できる。

## 変更範囲と方針

[視線調整窓口](../../../sincromisor-frontend/src/features/debug/model/debugConsoleGazeControls.ts)、[視線との接続](../../../sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts)、[姿勢調整窓口](../../../sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionControls.ts)、[姿勢設定の接続](../../../sincromisor-frontend/src/app/controller/sincroAppController.ts)、既存の設定保存層を対象とする。
同じ保存基盤へ既知の調整値を追加し、既存モデルを値の正本にする。全設定を診断モデルへ移す再設計は行わない。
無関係な設定通知や有効アプリの差し替えで、旧シーンへ通知する経路を復活させない。
較正結果の永続化、追跡・IKアルゴリズムの変更、独立した実験ページの保存、音声調整の保存は対象外。

## 確認方法と文書同期

視線プリセットと手動値の往復、シーン接続をまたぐ復元、通常設定と診断強度を交互に変更してから復元する経路、全設定初期化を対象テストで確認する。[既存の姿勢設定テスト](../../../sincromisor-frontend/src/app/controller/__tests__/sincroAppPoseSettings.test.ts)を利用する。
開発ブラウザーで視線・姿勢の代表的な調整とリロードを行い、表示と実効設定の一致を確認する。追跡精度の再評価や実写素材の記録は不要。
変更範囲の静的検査とフロントエンドの型確認・ビルドを行う。
[デバッグUI設計](../../../documents/design/frontend/setting-and-debug-ui/debug-design.md)、項目一覧、[共通枠組み](../../../documents/design/frontend/app-shell.md)、[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)へ保存対象・姿勢強度の優先順位・初期化を記載する。
