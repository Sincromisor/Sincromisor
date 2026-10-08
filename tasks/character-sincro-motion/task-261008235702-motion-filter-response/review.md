# レビュー: task-261008235702-motion-filter-response

## 判定

APPROVED

## 理由・申し送り

- `temporalArmStateEstimator.ts`は手首と腕のスカラーをOne Euro Filterへ渡す一方、通常観測の`bodyLocalElbow`を未平滑で`TemporalArmState`へコピーする。`sincroPoseRetargeter.ts`の155ミリ秒平滑化と最終姿勢の角速度制限も重なるため、同一録画で揺れと追従を比較する根拠がある。
- 依存する比較経路、座標一貫性、欠損表示時計は完了済みである。`SincroMotionClock`と`SincroPoseArmDisplayState`は観測時刻と描画評価時刻を分離し、入力系列の切替・逆行・停止・VRM交換では`SincroPoseRetargeter.reset()`が表示状態とIKの極履歴を破棄する既存契約がある。
- 現在のIK solverは描画ごとの`solve()`で極方向を保存する。観測フィルターの更新と同じ所有者にするには、極履歴を新しいPose観測時刻だけで確定し、描画評価で作った予測・補間結果を次の観測基点として保存しない必要がある。この扱いはタスクの完了条件で検証可能であり、公開契約の変更や追加設計判断は不要である。
- 比較対象は既存6動作と固定時刻列に限られ、根拠のない性能値や追加撮影を要求していない。非公開の実写原本が無い場合に合成入力を実写実績と扱わない条件も明確である。実測で採用根拠を得られなければ既定値を維持するため、最小範囲で実行できる。
- 実装時は`documents/rules/source-comments.md`を直接適用する。コメント規約をタスク要件として複製・省略していない。

## 自律補完

- `AUTO_FIX`: 観測フィルターは`TemporalStateEstimator`の新しい`mediaTimeMs`のPose観測だけで更新し、実際の隣接観測時刻差を`dtMs`へ渡す。`bodyLocalElbow`の平滑化は既存の腕フィルターと同じ所有者へ追加し、欠損中は観測フィルターを進めない。
- `AUTO_FIX`: `SincroPoseArmDisplayState`以降の予測・描画補間、`SincroPoseRetargeter`の指数平滑化、`SincroVrmPoseComposerService`の角速度制限は表示評価時刻だけで進める。IKの極履歴には観測時刻または観測系列番号を渡し、新観測時だけ確定する。描画だけの反復、同時刻の再描画、予測結果、補間結果では極履歴を更新しない。時計の逆行、入力切替、追跡停止、VRM交換、IK入力源切替では既存の`reset()`／`resetPoleHistory()`で破棄する。
- `AUTO_FIX`: 最小の確認は、同じ観測列で描画回数だけを変えてOne Euro出力と確定済み極履歴が一致すること、表示時刻を進めた場合だけ補間と角速度制限が進むこと、既存の静止・ゆっくりした腕上げ・速い手振りを比較経路で確認することとする。交差・欠損復帰は利用可能な既存区間だけを回帰確認し、原本が無い条件は未確認として残す。
