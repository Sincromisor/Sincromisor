# 撮影済み入力による比較結果

基準は `86929dfdbc43e31390da98c987c864bb39e6686a`、候補はこの成果物と同じ実装コミットである。
6動画と6記録は[入力目録](recording-inventory.json)のSHA-256とすべて一致した。
[集計結果](comparison-summary.json)には入力・出力・時刻列・ローカルモデル・VRMのハッシュ、設定、
実測したVRMプロファイル、対象ボーン、区間、標本数を保存した。原動画・生の計算結果・人物の写る画像はGit管理外である。

## 判定と限界

610フレームすべてで、HEADの体幹由来は `mixed`、候補は `pose`となった。
この結果は肩と腰を共通生座標で計算できることを示す。表示品質全体の改善を示すものではない。
肘反転の拒否理由は両条件で0件。到達制限の減少は閾値を緩めずに得られた。

次の値は最終確認区間の左上腕だけを抜き出した。回転差RMSと振幅の単位はラジアンで、
静止動作以外のRMSには意図した動きも含む。全ボーン・調整区間はJSONにある。

| 動作                  | フレーム数 | 到達制限フレーム数 | 回転差RMS         | 出力振幅          |
| --------------------- | ---------- | ------------------ | ----------------- | ----------------- |
| arms-cross            | 134        | 49 → 0             | 0.03275 → 0.07322 | 0.44652 → 0.93427 |
| both-arms-slow-raise  | 101        | 47 → 0             | 0.00907 → 0.01447 | 0.09204 → 0.09781 |
| fast-wave             | 84         | 39 → 0             | 0.12355 → 0.15364 | 0.52751 → 0.85471 |
| hand-out-and-return   | 89         | 38 → 0             | 0.01658 → 0.04197 | 0.22585 → 0.14415 |
| neutral-10s           | 110        | 110 → 0            | 0.00230 → 0.00269 | 0.00967 → 0.01010 |
| single-arm-slow-raise | 92         | 24 → 0             | 0.02412 → 0.04079 | 0.24718 → 0.36221 |

静止時の揺れは小幅に増えており、候補を「揺れが改善した」とは判定しない。
動作振幅も区間によって増減する。遅れは入力の上腕挙上角または肘屈曲角と最終回転の相関を最大にする系列内の時間差である。
交差などの複数軸運動では相関が弱い、または負の区間があり、その遅れ値だけでは追従性を評価できない。
撮影から表示までの絶対遅延や人体の正解姿勢は測定していない。

元の観測間隔を保ち、30fpsへの再標本化はしていない。最初の観測から2秒後以降を前後に二分し、
前半を調整、後半を最終確認とした。今回は設定値の最適化をしていない。同一人物・同一録画内での確認であり、
別環境への一般化は未評価である。

## HandとGesture

元ログには利用可能なHand/Gesture生結果がないため、手の出し入れ・高速手振り・静止の3動画の
記録時刻が2〜8秒の範囲だけを、ローカルのCPUモデルで一度推論して保存した。
合計118観測で、Hand検出は順に27/38、19/35、43/45観測だった。
同じ保存済みHand/Gesture列をHEADと候補へ渡し、再推論そのものの優劣とは区別した。
JSONの `Hand再推論`区間に腕と人差し指付け根の最終回転を集計している。入力の指角度を正解値とはせず、指の遅れは欠測とする。

モデルファイルのローカルSHA-256は集計JSONにある。再推論は `@mediapipe/tasks-vision 1.0.1`、
元ログのPose/Face推論は `0.10.34`で、元モデルのハッシュは記録されていないため同一性は未確認である。
Handは全画面推論後に保存Poseの手首へ割り当てた。ROI推論性能の比較ではない。

元MP4をロスレスWebMへ変換した非公開コピーをBlob URLで読み、各シーク後の `currentTime`を検査した。
最大差は0.001msだった。動画時刻には記録の `mediaTimeMs`を直接用い、交差・挙上の選択フレームで
保存Poseランドマークと動画の位置関係を目視した。元記録のカメラ到着遅延までは復元できない。
HTTPのRange非対応で0秒へ戻っていた初回の試行結果は破棄し、検証済み列から両条件を再計算した。

## 加工した欠損試験

手の出し入れの原記録から、先頭観測+4〜6秒の16フレームを削除する条件と、
そのPose生結果を未検出へ置換する条件を作った。原本は変更せず、加工後も残した観測の時刻は変更していない。
削除条件は73フレーム、置換条件は89フレームである。
置換した候補では左右合計で `predicted`10、`lost`22、`recovering`1腕フレームを通り、
同じ条件を本番リターゲット・最終合成まで計算した。`加工した欠損復帰`区間に復帰角差を集計した。
削除だけでは無到着中の描画を発生させないため、無到着中の期限切れと同一時刻再描画は固定入力の結合テストで別途確認した。

## 目視

Playwright CLIで非公開の動画と、HEAD/候補の保存済み `finalPose`を本番 `normalizedPoseWriter`で適用したVRMを並べた。
交差は動画6500msと記録6458.1ms、両腕挙上は動画7000msと記録7000.5msを比較した。
画像は `work/private-artifacts/task-261008235701-recorded-motion-quality-baseline/visual-*.png`にある。

HEADの交差はほぼT姿勢に見える。候補は前腕の曲がりが増えたが、胸の前での交差には達していない。
両腕挙上も候補で左右の再現に差があり、実写の両腕挙上を十分に再現していない。
座標・尺度の不変条件と欠損終了は確認できたが、これらの最終表示の不一致は残る。
今回の3タスクを、モーション全体の品質改善完了とは扱わない。

## 再実行

リポジトリのルートから、[非公開入力のサーバー](serve-private.py)を `source`と `generated`の2引数でそれぞれ起動する。
それぞれlocalhostの8877、8878だけで待ち受ける。原本は読み取り、新規JSONは上記の非公開出力先へ書く。

基準HEADを一時ディレクトリへ展開し、現在と同じnode_modulesとpublicを参照してViteを5174で起動する。
現在のViteは5173を使う。基準側へ追加する計測コードは
`src/character/motionEvaluation/motionReplayComparison.ts`と[比較用入口](motion-comparison-local.ts)だけで、既存の処理は変更しない。
比較用入口は一時的に各 `src/motion-comparison-local.ts`へコピーし、終了後に削除する。
入口の相対importはその配置を前提とする。

ブラウザーで空の同一オリジンページを開き、次の式をPlaywrightの `page.evaluate()`から実行する。
各 `compare()`呼出しはVRMと推定・合成の所有者を新規作成する。

```js
const { compare, inferHands } = await import("/motion-comparison-local.ts");
await inferHands("hand-out-and-return"); // 同じ列を使う比較では再実行しない
await compare("hand-out-and-return", "candidate");
await compare("hand-out-and-return", "candidate-hands");
await compare("hand-out-and-return", "candidate-deleted");
await compare("hand-out-and-return", "candidate-missing");
```

元のMP4からWebMは `ffmpeg -i <原本> -an -c:v libvpx-vp9 -lossless 1 -fps_mode passthrough <非公開出力>/<動作>.webm`で作る。
HEAD側は5174で `head`、`head-hands`、`head-deleted`、`head-missing`を指定する。
6動作すべてで通常条件、上記3動作でHand条件、手の出し入れで加工条件を実行する。
目視用入口は[描画スクリプト](motion-visual-local.ts)を同様に一時配置し、`show(動作, 動画時刻ms)`を呼ぶ。

```sh
SINCRO_RECORDED_COMPARISON=1 \
SINCRO_COMPARISON_HEAD=86929dfdbc43e31390da98c987c864bb39e6686a \
npm run test --prefix sincromisor-frontend -- \
  src/character/motionEvaluation/__tests__/motionRecordedComparison.generate.test.ts
```

通常のテストは非公開入力を要求せず、集計生成テストをスキップする。
