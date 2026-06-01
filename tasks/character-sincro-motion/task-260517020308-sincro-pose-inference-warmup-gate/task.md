# TASK-260517020308 Sincro Pose 推論遅延 gate の warm-up 誤検知対策

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High

## 目的

フロント側 pose tracking で `pose_inference_too_slow` が起動直後の MediaPipe warm-up を拾い、実運用上は継続できる端末でも face-only fallback する可能性を下げる。

## 背景

`TrackerRuntime` は PoseLandmarker の推論時間が固定閾値 `38ms` 以上の状態を 4 回連続で検出すると、`pose_inference_too_slow` として pose tracking を face-only に降格していた。

default の pose target fps は 12fps であり、推論周期は約 `83ms`。固定 `38ms` はこの周期に対して厳しめで、さらに初回 video 推論に wasm / GPU delegate の warm-up が混ざるため、起動直後の一時的な遅延を常時性能不足として扱う恐れがあった。

## 実装内容

- `pose_inference_too_slow` の警告閾値を、固定値ではなく target pose inference fps から算出するようにした。
    - 最低警告閾値は `38ms` を維持する。
    - default 12fps では、推論周期の 90% にあたる約 `75ms` を警告閾値にする。
- 起動直後 6 回の pose 推論サンプルを slow 判定から除外した。
- start / stop 時に pose 推論サンプル数と slow count をリセットするようにした。

## 確認結果

```sh
cd sincromisor-frontend
npm run build
```

成功。

```sh
cd sincromisor-frontend
npx biome check src/ts/FaceTracking/TrackerRuntime.ts
```

成功。

## 未実施

- 実カメラでの長時間 pose tracking 確認は未実施。
