# 音声区間検出のONNX RuntimeをWASM専用版へ変更

## 背景 / 目的

Silero VADは `executionProviders: ["wasm"]` だが通常版を読み込む。ONNX Runtime Web 1.30.0で入口だけを変えた調査では、Workerが411,306→76,171バイト、WASMが28,312,028→14,239,897バイトに減った。固定の合格値ではなく、同じ依存版で再比較するための参考値である。

優先度: 高。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

なし。

## 担当範囲と設計判断

- [`src/features/media/vad/sileroVad.worker.ts`](../../../sincromisor-frontend/src/features/media/vad/sileroVad.worker.ts) の入口を `onnxruntime-web/wasm` に変更し、生成されるWASMの参照先と配信を確認する。
- 推論モデル、しきい値、音声形式、Worker通信契約、実行方式は維持する。GPU対応、モデル最適化、依存更新、配備基盤の改修は対象外。

## 完了条件

- [x] WASM専用版が使われ、Workerと必要なWASMの容量が現状より小さくなる。生成物に不要な通常版が残らない。
- [x] 既存の同一オリジン配信でWASMとモデルを読み込め、VADが `ready` へ進み、音声入力の推論結果が返る。初期化失敗時の既存の代替動作を維持する。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- `npm run build`、既存VADテストを実行し、Worker・WASMの圧縮前とgzip後の容量を記録する。
- ビルド済みページを既存の開発配信で開き、WASMの取得成功と短い音声入力へのVAD応答を確認する。実写・音声原本は公開タスク成果物に含めない。

## 文書同期

[audio/vad.md](../../../documents/design/frontend/audio/vad.md) の実行方式・配信資産の説明を必要箇所だけ同期する。通信契約と設定は変更しない。

## 参照

[ONNX Runtime公式資料](https://onnxruntime.ai/docs/tutorials/web/deploy.html#conditional-importing)（参照日: 2026-10-17）。WASMのみを使う場合の専用入口を採用する。

## 実施結果

- WASM専用入口へ変更し、VAD設計を同期した。ビルド・対象Biome・既存VADの4テストが成功した。
- Workerは411,306→76,171バイト（gzip 110,581→25,031）、WASMは28,312,028→14,239,897バイト（gzip 6,727,966→3,695,884）。通常版のjsep資産は生成されない。
- ビルド済みページをローカルプレビューから配信し、専用ChromeでWorkerの `ready`、合成PCM入力に対する推論確率0.0005886555を確認した。モデル欠落時にも `unavailable`の後にRMS代替結果が返った。実音声は記録していない。
