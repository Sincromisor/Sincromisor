# TASK-260519191620 frontend camelCase path full migration

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: High
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

`sincromisor-frontend/src/ts/**` と `sincromisor-frontend/src/react/**` の TypeScript / TSX ファイル名・ディレクトリ名を、AGENTS.md の camelCase 規約へ実際に移行する。

## 背景

`TASK-260517134247` では URL ルートに関係する page directory を規約例外として明示し、低リスクな entry file 名だけを camelCase へ移行した。一方で同タスク内に「`src/ts/**` / `src/react/**` の PascalCase ファイルと PascalCase directory は、次の rename 実装タスクで領域単位に移行する」と残っており、対応タスクが起票されていなかった。

2026-05-19 の再確認では、URL 例外を除いた `src/ts/**` / `src/react/**` に非 camelCase の TS/TSX ファイルが 137 件、ディレクトリが 18 件残っている。

## スコープ

- `src/ts/**` の PascalCase / kebab-case / snake_case file path の camelCase 移行
- `src/react/**` の PascalCase / kebab-case / snake_case file path の camelCase 移行
- import path の追従
- Vite / worker / dynamic import / HTML script path の影響確認
- macOS case-insensitive filesystem でのリネーム事故を避けるための中間名利用

## 非対象

- URL ルートに対応する top-level page directory のリネーム
    - `src/simple-vrm/`
    - `src/looking-glass-vrm/`
    - `src/motion-debug/`
    - `src/pose-landmarker-spike/`
    - `src/vrm360/`
- ユーザー向け URL の変更
- endpoint / JSON payload 契約の変更
- UI 表示文言や情報設計の変更

## 完了条件

- URL 例外を除いた `src/ts/**` / `src/react/**` の TS/TSX ファイル名が camelCase になっている。
- URL 例外と `__tests__` を除いた `src/ts/**` / `src/react/**` のディレクトリ名が camelCase になっている。
- worker entry など、リネームしない必要がある path には理由が明示されている。
- `cd sincromisor-frontend && npm run check` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。
- 主要ページの Vite entry がリネーム後も解決できることを確認している。

## 確認コマンド案

```sh
find sincromisor-frontend/src/ts sincromisor-frontend/src/react -type f \( -name '*.ts' -o -name '*.tsx' \) \
  | sed 's#^sincromisor-frontend/src/##' \
  | awk -F/ '{name=$NF; base=name; sub(/\.tsx?$/,"",base); sub(/\.test$/,"",base); sub(/\.worker$/,"",base); if (base !~ /^[a-z][A-Za-z0-9]*$/) print}'

find sincromisor-frontend/src/ts sincromisor-frontend/src/react -type d \
  | sed 's#^sincromisor-frontend/src/##' \
  | awk -F/ '{name=$NF; if (name !~ /^[a-z][A-Za-z0-9]*$/ && name !~ /^__tests__$/) print}'

cd sincromisor-frontend
npm run check
npm run build
```

## 実施結果

- `src/ts/**` / `src/react/**` の TypeScript / TSX ファイル名と内部ディレクトリ名を camelCase へ移行した。
- `sincroTracker.worker.ts` / `sileroVad.worker.ts` も camelCase へリネームし、リネーム例外は作らなかった。
- URL ルートに対応する top-level page directory は変更していない。
- `AGENTS.md` と現行 ADR の path 参照をリネーム後の正本 path へ更新した。
- `npm run check` と `npm run build` が成功し、Vite build 出力で主要ページと worker asset の解決を確認した。
