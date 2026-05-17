# TASK-260517134245 frontend null undefined normalization

- 作成日: 2026-05-17
- ステータス: Open
- 優先度: Medium
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

アプリ内部の欠損表現を `undefined` に寄せ、`null` と `undefined` の混在を減らす。

## 背景

規約ではアプリ内の欠損を `undefined` に統一し、外部 I/O 境界でのみ `null` を許容すると定めている。2026-05-17 時点で `null` は 1046 箇所 / 91 ファイルに存在する。

ただし React の「何も描画しない」ための `return null` や `JSON.stringify(value, null, 2)` など、機械的に置換すべきでない箇所も多い。対象を state / model / service の欠損表現に絞って進める。

## スコープ

- app state / snapshot / service model の `T | null` を `T | undefined` へ整理
- device selection の未選択状態を `undefined` へ統一
- motion / gaze / RTC diagnostic snapshot の欠損表現を整理
- `value || defaultValue` のうち既定値用途を `value ?? defaultValue` へ置換
- 外部 API や DOM API が返す `null` は境界で変換する

## 非対象

- React component の `return null`
- `JSON.stringify(value, null, 2)` の `null`
- DOM API の戻り値型そのものの変更
- サーバー contract の変更
- 表示文言や UI 情報設計の変更

## 対象例

- `sincromisor-frontend/src/react/app/**`
- `sincromisor-frontend/src/react/simple-vrm/**`
- `sincromisor-frontend/src/react/dialog/**`
- `sincromisor-frontend/src/ts/App/**`
- `sincromisor-frontend/src/ts/UI/DialogManager.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/ts/MediaDevices/SincroMediaDeviceService.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`

## 実装方針

1. まず state snapshot / type 定義を小さな境界ごとに整理する。
2. UI component の props は `undefined` 既定へ寄せ、必要な場合だけ React の `null` を返す。
3. `== null` は `value === undefined` または境界 helper へ置換する。
4. `||` は論理条件と既定値用途を分け、`0` / `""` / `false` を壊さない。

## 完了条件

- アプリ内部 model / state の新規欠損表現が `undefined` に統一されている。
- `null` を残す箇所が React render / DOM boundary / JSON formatter / 外部 contract などに限定されている。
- `value || defaultValue` の既定値用途が `??` に置き換わっている。
- `cd sincromisor-frontend && npm run check:biome` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認コマンド案

```sh
rg "\\bnull\\b|\\|\\|" sincromisor-frontend/src
cd sincromisor-frontend
npm run check:biome
npm run build
```
