# TASK-260517134247 frontend camelCase path rename plan

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: Medium
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

フロントエンドの `.ts` / `.tsx` ファイル名とディレクトリ名を camelCase 規約へ寄せるための移行方針を決め、低リスクな範囲からリネームする。

## 背景

`AGENTS.md` では TypeScript の `.ts` ファイル / ディレクトリを camelCase と定めている。2026-05-17 時点で TS / TSX 166 ファイル中 133 ファイル、ディレクトリ 22 箇所が新規約と一致していない。

一方で、`simple-vrm` / `looking-glass-vrm` / `vrm360` などは URL ルートや Vite entry に関係するため、単純な一括リネームは画面遷移を壊す可能性がある。

## スコープ

- 規約対象と例外対象の分類
- URL ルートに関係するディレクトリの扱い決定
- TS / TSX ファイルの camelCase リネーム
- import path の追従
- Vite entry / HTML script path の追従
- `forceConsistentCasingInFileNames` で検出できる状態の維持

## 非対象

- URL パスのユーザー向け変更
- ページ構成の変更
- UI 見た目や runtime 挙動の変更
- ファイル分割そのもの

## 対象例

- `sincromisor-frontend/src/ts/App/**`
- `sincromisor-frontend/src/ts/RTC/**`
- `sincromisor-frontend/src/ts/UI/**`
- `sincromisor-frontend/src/ts/SincroVRM/**`
- `sincromisor-frontend/src/ts/FaceTracking/**`
- `sincromisor-frontend/src/ts/CharacterGaze/**`
- `sincromisor-frontend/src/react/**`

## 要検討の例外候補

- `sincromisor-frontend/src/simple-vrm/`
- `sincromisor-frontend/src/looking-glass-vrm/`
- `sincromisor-frontend/src/motion-debug/`
- `sincromisor-frontend/src/pose-landmarker-spike/`
- `sincromisor-frontend/src/vrm360/`

## 実装方針

1. URL ルートに関係するディレクトリは、規約例外にするか、URL を保ったまま内部 entry だけ移すかを決める。
2. macOS の case-insensitive filesystem でリネーム事故が起きないよう、必要に応じて中間名を使う。
3. 1 回の差分で広範囲を触りすぎない。領域ごとに分ける。
4. 大規模 rename 後は `npm run build` と `npm run check:biome` を必ず実行する。

## 完了条件

- 規約例外にする path が明示されている。
- 低リスクな `.ts` / `.tsx` ファイル名が camelCase に移行されている。
- import path と Vite entry が追従している。
- `cd sincromisor-frontend && npm run check:biome` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。
- 画面 URL を変える場合は、影響と再デプロイ要否が明示されている。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run check:biome
npm run build
```

## 決定事項

- URL ルートに対応する下記 top-level page directory は、ユーザー向け URL と Vite MPA entry の安定性を優先し、当面の規約例外とする。
    - `src/simple-vrm/`
    - `src/looking-glass-vrm/`
    - `src/motion-debug/`
    - `src/pose-landmarker-spike/`
    - `src/vrm360/`
- URL は維持し、各 page directory 内の entry file は camelCase へ移す。
- `src/ts/**` / `src/react/**` の class / component 名由来の PascalCase ファイルと PascalCase directory は、URL 契約と独立しているため、次の rename 実装タスクで領域単位に移行する。
- worker entry (`*.worker.ts`) は bundler 出力と runtime load path の確認が必要なため、通常 entry とは別の小タスクで扱う。

## 実施内容

- `src/ts/main-vrm.ts` を `src/ts/mainVrm.ts` へリネームした。
- page directory 内の薄い HTML entry を camelCase へリネームした。
    - `src/simple-vrm/main-react.tsx` -> `src/simple-vrm/mainReact.tsx`
    - `src/looking-glass-vrm/main-react.tsx` -> `src/looking-glass-vrm/mainReact.tsx`
    - `src/looking-glass-vrm/main-vrm-looking-glass.ts` -> `src/looking-glass-vrm/mainVrmLookingGlass.ts`
    - `src/vrm360/main-react.tsx` -> `src/vrm360/mainReact.tsx`
    - `src/vrm360/main-vrm360.ts` -> `src/vrm360/mainVrm360.ts`
- 対応する HTML script path を追従した。
- 画面 URL は変更していないため、endpoint / JSON / 再デプロイ手順への追加影響はない。

## 確認結果

```sh
cd sincromisor-frontend
npm run check:biome
npm run build
```

- `npm run check:biome`: 成功
- `npm run build`: 成功
