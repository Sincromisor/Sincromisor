# TASK-3036 開始後設定パネルのcompact navigation改善

- 作成日: 2026-05-01
- ステータス: Done
- 優先度: Medium
- 親タスク: `TASK-3033`
- 依存: `TASK-3035`

## 目的

開始後の右側設定パネルで、カテゴリナビが初期表示を占有しすぎないようにし、desktop / mobile のどちらでも本文の開始位置が自然に見える密度へ調整する。

## 背景

- desktop では右側設定パネルが `560px` 幅のため、`SettingsShell` が1カラム表示になり、カテゴリ一覧が本文を下へ押し下げやすい。
- mobile `390x844` では、カテゴリ一覧だけで初期表示の大部分を占め、現在ページの本文が見えにくい。
- 起動前 dialog の左右分割設定シェルは成立しているため、まず開始後右側パネルだけを container responsive として改善する。

## スコープ

- 開始後右側設定パネルの `SettingsShell` 表示密度
- panel 実幅基準の compact navigation
- `simple-vrm` / `vrm360` / `looking-glass-vrm` の共通影響確認

## 非対象

- 起動前 dialog の大規模 layout 変更
- 設定項目そのものの追加・削除
- Debug Console の mobile layout

## 実装タスク

1. 右側設定パネル向けの compact navigation variant を追加する。
2. nav item height、gap、section label の余白を詰め、本文見出しが初期表示に入りやすくする。
3. mobile 幅では、カテゴリ一覧を compact tab / disclosure / select のいずれかへ縮退する案を検討し、最小変更で実装する。
4. `開発者向け` 導線整理後のカテゴリ数を前提に、不要な余白を削る。
5. `looking-glass-vrm` のページ固有カテゴリが通常カテゴリと混ざらないことを確認する。

## 完了条件

- desktop `1280x720` の設定パネル初期表示で、カテゴリ一覧だけが画面を支配せず、本文の `会話` 見出しが自然に見える。
- mobile `390x844` で、カテゴリ選択と本文確認の往復がしやすい。
- 起動前 dialog の設定シェルに意図しない visual regression がない。
- `vrm360` / `looking-glass-vrm` の開始後設定パネルにも明確な崩れがない。

## 確認

- `simple-vrm` desktop / mobile で設定パネルを確認する。
- `vrm360` / `looking-glass-vrm` desktop で右側設定パネルを確認する。

## 実施メモ

- 開始後の右側設定パネルは `SettingsShell` の `responsiveMode="container"` と `navigationDensity="compact"` を使い、panel 実幅を基準にカテゴリナビを縮退する方針で整理した。
- desktop `1280x720` ではカテゴリナビが横並びの compact navigation になり、本文見出しが初期表示内に入ることを確認した。
- mobile `390x844` ではカテゴリ選択を select に縮退し、本文の確認領域を確保することを確認した。
- `vrm360` / `looking-glass-vrm` desktop でも右側設定パネルに shared shell 由来の明確な崩れはなかった。
