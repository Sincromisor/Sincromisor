# Sincro キャラクター Animation 調査依頼一覧

## 目的

このディレクトリは、Sincromisor の `sincro` モードにおけるキャラクターアニメーション設計の追加調査を、分野別の専門家へ依頼するための依頼文をまとめる。

各依頼文は、専門家が Sincromisor の詳細を知らない前提で読めるように、共通背景、前提技術、調査してほしいこと、期待成果物を含める。

## 共通背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するためのサービス基盤である。`sincro` モードでは、単眼 Web カメラで撮影したユーザーの顔・上半身・腕・手・指の動きをもとに、VRM 1.0 / VRoid Studio 系のキャラクターを Three.js 上で動かす。

目的は、人体の姿勢を完全再現することではない。会話中のキャラクターが、ユーザーの動作意図を「ものまね」しているように見え、かつ破綻しないことを優先する。既存調査では、MediaPipe の特徴点を骨格姿勢の正解値ではなく、不確実な観測値として扱う方針を採っている。

基本構成は次を想定する。

```text
Web カメラ
  -> MediaPipe Pose / Hand / Face / Gesture 観測値
  -> 信頼性の対応表
  -> 身体のローカル座標系での標準状態
  -> 時系列状態推定
  -> 動作意図 / 表現調整
  -> アバター動作調整情報
  -> IK / FK / 加算アニメーション
  -> VRM 正規化済みローカル姿勢
  -> three-vrm / Three.js 描画
```

## 渡す資料

専門家には、この `requests/` ディレクトリの該当依頼文と、必要に応じて次の既存資料を渡す。

- [../roadmap.md](../roadmap.md): Sincro キャラクターアニメーションのロードマップ
- [../report01.md](../report01.md): 上半身モーションキャプチャ実装方式
- [../report02.md](../report02.md): IK 以外の品質改善手法
- [../report03.md](../report03.md): 単眼 Web カメラによる VRM 上半身モーション品質改善 Q&A
- [../report04-three-vrm.md](../report04-three-vrm.md): three-vrm による VRM-1.0 キャラクターアニメーション実装ベストプラクティス

## 非対象

今回の追加調査では、プライバシー・個人情報・生体情報としてのログ管理は対象外とする。動作デバッグログや特徴点ログの技術仕様は評価基盤の調査対象に含めてよいが、同意、保存期間、匿名化、外部共有などの方針は別途扱う。

## 依頼文一覧

番号は分野整理のためのものであり、実装優先順ではない。実装設計に入る前には、まず [07-evaluation-debug-qa.md](07-evaluation-debug-qa.md) で記録・再生・評価基盤を揃え、次に [09-canonical-upper-body-state.md](09-canonical-upper-body-state.md) で後段が共有する座標系と語彙を固める。

| ファイル                                                             | 優先 / 依存    | 分野                                        | 主な論点                                           |
| -------------------------------------------------------------------- | -------------- | ------------------------------------------- | -------------------------------------------------- |
| [01-mediapipe-tracking.md](01-mediapipe-tracking.md)                 | 入力層         | 単眼姿勢推定 / MediaPipe 運用               | MediaPipe 出力の信頼度、ROI 化、代替モデル比較     |
| [02-motion-solver-ik.md](02-motion-solver-ik.md)                     | 09 に依存      | モーションソルバ / IK / 関節制約            | 肘反転、肩崩れ、手首ロール、指制御                 |
| [03-temporal-filtering.md](03-temporal-filtering.md)                 | 09 に依存      | 時系列推定 / フィルタ / レイテンシ          | One Euro、Kalman、一時欠損、復帰ジャンプ           |
| [04-character-motion-design.md](04-character-motion-design.md)       | 09 に依存      | キャラクターアニメーション / ものまねらしさ | 追従と演出、意味に基づく動作動作、かわいさ         |
| [05-vrm-three-vrm.md](05-vrm-three-vrm.md)                           | 02 / 09 と接続 | VRM / three-vrm / AvatarMotionProfile       | 正規化済み姿勢、任意ボーン、姿勢合成処理           |
| [06-web-realtime-performance.md](06-web-realtime-performance.md)     | 横断           | Web リアルタイム実装 / パフォーマンス       | Worker、FrameClock、端末別許容時間                 |
| [07-evaluation-debug-qa.md](07-evaluation-debug-qa.md)               | 実装最優先     | 評価基盤 / デバッグ / QA                    | 再生、評価指標、固定テストモーション               |
| [08-calibration-ux.md](08-calibration-ux.md)                         | 09 と接続      | キャリブレーション / UX ガイド              | 初期姿勢、継続的なキャリブレーション、ユーザー誘導 |
| [09-canonical-upper-body-state.md](09-canonical-upper-body-state.md) | 後段語彙の前提 | CanonicalUpperBodyState / 座標系            | 体幹の座標系、腕の意味量、値域、デバッグ表示       |
