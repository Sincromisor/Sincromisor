# Web リアルタイム実装 / パフォーマンス 調査依頼

## 目的

Sincromisor の `sincro` モードで、Web ブラウザ上の単眼カメラ入力、MediaPipe 推論、Three.js / VRM 描画をリアルタイムに動かすための実装構成、performance budget、端末別 fallback を検証する。

調査では、単なる高速化ではなく、推論タイミングの安定、frame timestamp の整合、UI thread の詰まり回避、会話中に許容できる体感遅延を重視してほしい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、単眼 Web カメラから MediaPipe Pose / Hand / Face / Gesture を実行し、VRM 1.0 キャラクターの上半身 motion を生成する。

既存資料では、`requestAnimationFrame` だけで推論 loop を回すのではなく、`HTMLVideoElement.requestVideoFrameCallback()` を使った FrameClock、`MediaStreamTrack.getSettings()` による実カメラ設定の記録、必要に応じた Web Worker 分離を候補としている。

## 前提技術

- フロントエンド: TypeScript + Vite
- 推論: MediaPipe Tasks Web
- 描画: Three.js + `@pixiv/three-vrm`
- 入力: Web camera via `getUserMedia`
- 実行環境: desktop browser を主対象、mobile / tablet は可能なら比較対象
- debug: motion-debug page で camera / tracker / VRM / metrics を同時表示する想定

## 調査してほしいこと

### FrameClock

既存資料では、動画フレーム基準の clock へ移行する案を挙げている。

調査してほしい論点は次である。

- `requestVideoFrameCallback()` を使うべき理由と fallback。
- `mediaTime`、`presentationTime`、`presentedFrames` の使い方。
- 推論 timestamp、描画 timestamp、MediaPipe result timestamp の整合。
- dropped frame の検出方法。
- Safari / Firefox などでの実装差。

### CameraQuality

カメラ設定は指定通りになるとは限らないため、実際の設定と入力品質を記録する必要がある。

調査してほしい論点は次である。

- `getUserMedia` constraints の推奨値。
- `MediaStreamTrack.getSettings()` で記録すべき値。
- 解像度、fps、motion blur、露出不足、画面端、手の小ささをどう評価するか。
- debug 用の品質スコアとユーザー向けガイドの分離。

### Worker / main thread 構成

MediaPipe Tasks Web の実行が UI thread をブロックする場合、Worker 化が候補になる。

調査してほしい論点は次である。

- Pose / Hand / Face / Gesture のどこまでを Worker に置くべきか。
- OffscreenCanvas や ImageBitmap を使う場合のコスト。
- Worker とのデータ転送形式。
- 推論順序と並列実行の現実的な構成。
- Worker fallback と debug 表示の両立。

### performance budget

Sincromisor では、推論だけでなく VRM 描画、UI、音声対話、WebRTC も同時に動く可能性がある。

調査してほしい論点は次である。

- 30fps 入力、60fps 描画、30fps 推論の現実性。
- Pose full-frame + Hand / Face ROI + Gesture の予算。
- 端末クラス別の推奨設定。
- debug log 記録中の追加負荷。
- 負荷が高い場合の degradation policy。

### ブラウザ・端末差分

調査対象は 2026 年時点の主要ブラウザとする。

WebGPU / WebNN などは、標準構成の置き換え提案ではなく、互換性、degradation policy、将来候補として評価する。現時点の主判断は、MediaPipe Tasks Web + Three.js / three-vrm を安定して動かすための構成に置く。

知りたい観点は次である。

- Chrome / Edge / Safari / Firefox の差分。
- macOS / Windows / iOS / Android の差分。
- WebGL / WebGPU / WASM SIMD / WebNN の実用性。
- カメラ権限、デバイス選択、background throttling。

## 期待成果物

- FrameClock 設計案。
- MediaPipe 推論 loop の推奨構成。
- Worker 化の判断基準と構成図。
- 端末クラス別 performance budget。
- degradation policy。例: Gesture 停止、Hand fps 低下、Face fallback。
- debug snapshot に記録すべき performance / camera metadata。

## 読んでほしい資料

- [roadmap.md](roadmap.md)
- [report02.md](report02.md)
- [report03.md](report03.md)
- [report04-three-vrm.md](report04-three-vrm.md)
