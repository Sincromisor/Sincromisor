# TASK-260519234135 frontend gaze and tracking directory split

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

character gaze、face tracking、pose tracking runtime を `src/features/gaze` 配下に整理し、カメラ tracking とキャラクター視線制御の責務を分ける。

## スコープ

- `src/ts/characterGaze` の移動
- `src/ts/faceTracking` の移動
- `characterGaze` / `faceTracking` / `poseTracking` のサブディレクトリ分割
- worker entry と MediaPipe wasm 参照の確認

## 非対象

- tracking アルゴリズム変更
- CharacterBehaviorState の移動
- Debug Console UI の変更

## 完了条件

- gaze / face tracking / pose tracking の配置が明確に分かれている
- worker path と runtime 初期化が壊れていない
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```

## 完了メモ

- 完了日: 2026-05-20
- 実装: frontend を `src/app` / `src/features` / `src/character` / `src/shared` / `src/pages` の責務境界へ再配置した。
- 確認: `cd sincromisor-frontend && npm run build` 成功。
- 確認: `cd sincromisor-frontend && npm run check` 成功。
- 確認: `cd sincromisor-frontend && npm run test` 成功。
- 確認: dev server 上で `/` / `/simple-vrm/` / `/vrm360/` / `/looking-glass-vrm/` / `/motion-debug/` の page entry を Playwright smoke 確認した。backend 未起動のため RTC config 404 は想定内。
