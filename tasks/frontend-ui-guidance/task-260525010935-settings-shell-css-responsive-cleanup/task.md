# TASK-260525010935 settings shell css responsive cleanup

- 作成日: 2026-05-25
- ステータス: Done
- 優先度: Low
- 関連: `TASK-3043`, `TASK-260525010933`

## 目的

`SettingsShell` と起動前 dialog の responsive CSS 重複を整理し、設定 UI の見た目変更時に同じ layout ルールを複数 breakpoint へ手作業で反映する状態を減らす。

## 背景

- `settingsShell.css` では top navigation の layout / tab style が通常ルール、container query、media query に重複している。
- `configurationDialogSettings.css` は `SettingsShell` 内部 class への上書きを多く持っており、dialog 固有の必要幅や scroll 挙動が読み取りにくい。
- section 側にも inline style が残っており、CSS と component の責務境界がやや曖昧になっている。

## 方針

- `SettingsShell` の responsive mode を明確に分け、container responsive と viewport responsive の重複を減らす。
- dialog 固有の上書きは CSS 変数または modifier class へ寄せる。
- UI の見た目を大きく変えず、保守しやすさを優先する。
- `TASK-260525010933` で section wrapper が整理されたあとに着手する。

## スコープ

- `settingsShell.css` の top navigation / compact navigation / breakpoint 重複整理
- `configurationDialogSettings.css` の `SettingsShell` 上書き整理
- settings section の inline spacing / hint style を class 化できる箇所の整理
- CSS 変数名と modifier class の見直し

## 非対象

- 情報設計の変更
- 新しい画面レイアウトの追加
- デザイントークン全体の再設計
- `styles/sincroDebugConsole.css` の大規模整理

## 実装タスク

1. `settingsShell.css` の通常ルール / container query / media query で重複している selector を一覧化する。
2. top navigation の共通ルールを base または modifier へ寄せる。
3. compact navigation の breakpoint 差分を CSS 変数で整理する。
4. dialog 固有の width / scroll / footer layout を modifier class または CSS 変数で表現する。
5. settings section の inline style から class 化できるものを抽出する。
6. 画面幅ごとの表示が既存と同等であることを確認する。

## 想定変更箇所

- `sincromisor-frontend/src/features/settings/react/shell/settingsShell.css`
- `sincromisor-frontend/src/features/settings/react/shell/settingsShell.tsx`
- `sincromisor-frontend/src/features/dialog/react/configurationDialogSettings.css`
- `sincromisor-frontend/src/pages/simpleVrm/react/components/*`
- `sincromisor-frontend/src/pages/simpleVrm/react/panelStyles.ts`

## 完了条件

- `settingsShell.css` の同一 layout ルール重複が減っている。
- dialog 固有上書きの意図が modifier / CSS 変数名から読み取れる。
- 起動前 dialog と常設設定パネルの responsive 表示が崩れていない。
- section component の inline style が必要最小限になっている。

## 確認

- `cd sincromisor-frontend && npm run build`
- 起動前 dialog を desktop / tablet / mobile 相当幅で確認する。
- simple-vrm 常設設定パネルを desktop / narrow panel 相当幅で確認する。
- looking-glass-vrm の top navigation 初期表示を確認する。

## 実施メモ

- 優先度は低め。先に設定正本化と page / section 共通化を済ませる。
- CSS のみの整理でも、視覚差分が出やすいため Playwright screenshot で確認する。
- `SettingsShell` の top navigation / responsive 差分を CSS 変数中心に整理し、起動前 dialog 固有の上書きを `settingsShell--startupDialog` modifier へ寄せた。
- 2026-05-25 確認: `npm run build` / `npm run check` 成功。Playwright で起動前 dialog の desktop/tablet/mobile、simple-vrm 常設設定パネル、looking-glass-vrm 常設設定パネルの初期表示を確認。
