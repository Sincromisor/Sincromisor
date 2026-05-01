# TASK-3039 SettingsShell の内容面一体型タブナビゲーション共通化

- 作成日: 2026-05-02
- ステータス: Done
- 優先度: Medium
- 親タスク: `TASK-3033`
- 依存: `TASK-3036`, `TASK-3038`

## 目的

起動前ダイアログと開始後の設定パネルで共通利用している `SettingsShell` のカテゴリナビゲーションを、Webブラウザのタブのように内容面と一体化した見た目へ揃える。選択中カテゴリと表示中内容の対応をぱっと見で理解しやすくし、開始前後で同じ設定体系を扱っていることが自然に伝わる状態にする。

## 背景

- 現状のカテゴリナビゲーションは、選択中カテゴリが単体ボタンとして強調されているため、内容パネルとつながったタブには見えにくい。
- 開始後の右側設定パネルでは `navigationDensity="compact"` により横並びに近い表示になっているが、選択中カテゴリと内容面の一体感は弱い。
- 起動前ダイアログと開始後設定パネルは同じ `SettingsShell` と同じカテゴリ分類を共有しているため、見た目を意図的に分ける理由がない。
- 起動前は準備、開始後は調整という文脈差はあるが、カテゴリ移動のメンタルモデルは共通化したほうが認知負荷を下げられる。

## スコープ

- `SettingsShell` の標準ナビゲーション視覚表現
- 起動前ダイアログのカテゴリナビゲーション
- 開始後右側設定パネルのカテゴリナビゲーション
- `regular` / `compact` navigation density の役割整理
- desktop / mobile / narrow container での縮退表示確認
- 必要に応じた `documents/design/frontend_ui.md` の同期

## 非対象

- 設定カテゴリや設定項目そのものの追加・削除
- Debug Console のタブUI変更
- 右側ツールメニュー全体の再設計
- 起動前ダイアログと右側設定パネルのレイアウト構造の大規模変更
- WebRTC 接続仕様や設定値モデルの変更

## 実装タスク

1. `SettingsShell` のカテゴリナビゲーションを、内容パネルと一体化したタブ表現へ変更する。
2. 選択中タブは内容パネルと同じ背景・境界線にし、タブ下辺を内容パネルへ接続して見せる。
3. 非選択タブは背景、境界線、奥行き差を抑え、選択中タブとの差が視覚的に分かる状態にする。
4. `regular` / `compact` の違いは見た目の別体系ではなく、余白・高さ・最小幅などの密度差として整理する。
5. `SettingsShell` のアクセシビリティ属性を見直し、可能であれば `tablist` / `tab` / `tabpanel` / `aria-selected` の構造へ寄せる。
6. `developer` tone のカテゴリがある場合も、通常カテゴリとの関係が破綻しない見た目にする。
7. narrow container では、既存の select 縮退を維持するか、タブが横スクロールなしで成立する範囲を判断して調整する。
8. 変更内容が設計判断として残る場合は、`documents/design/frontend_ui.md` に `SettingsShell` の共通タブ表現方針を同期する。

## 実装対象候補

- `sincromisor-frontend/src/react/settings-shell/SettingsShell.tsx`
- `sincromisor-frontend/src/react/settings-shell/settingsShell.css`
- `sincromisor-frontend/src/react/dialog/ConfigurationDialogSettingsPanel.tsx`
- `sincromisor-frontend/src/react/simple-vrm/SimpleVrmControlPanel.tsx`
- `documents/design/frontend_ui.md`

## 完了条件

- 起動前ダイアログで、選択中カテゴリが内容パネルにつながったタブとして見える。
- 開始後右側設定パネルでも、起動前ダイアログと同じタブ表現のまま、密度だけがパネル幅に合わせて調整されている。
- 選択中カテゴリが、単体ボタンではなく現在表示中の内容面の見出しとして認識できる。
- `regular` / `compact` 間でUX上の一貫性があり、別UIに見えない。
- desktop と mobile の両方で、タブ文字列が重なったり、内容パネルと不自然に衝突したりしない。
- `simple-vrm` / `vrm360` / `looking-glass-vrm` の右側設定パネルに明確な崩れがない。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

```sh
playwright-cli open http://127.0.0.1:5173/simple-vrm/
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

## 確認観点

- 起動前ダイアログの初期表示で、`会話` タブと内容パネルが一体化して見える。
- 右側設定パネルの `会話` / `入出力デバイス` / `音声` / `表示` / `接続` の切り替えで、選択中タブが明確に追従する。
- `looking-glass-vrm` の `Looking Glass` カテゴリが追加されても、通常カテゴリと並んで破綻しない。
- mobile 幅で select 縮退またはタブ表示が読みやすく、本文確認領域を圧迫しすぎない。
- backend 未起動に由来する `/api/v1/RTCSignalingServer/config.json` 404 や `getUserMedia` 権限エラーは、UI layout 判定対象外として扱う。

## 実施メモ

- `SettingsShell` のナビゲーションを `tablist` / `tab` / `tabpanel` 構造へ寄せ、選択中カテゴリが内容面へ接続するタブ表現へ変更。
- `regular` / `compact` は余白・高さ・最小幅の密度差として整理し、狭幅 compact container では既存の select 縮退を維持。
- 起動前 dialog、開始後右側設定パネル、Looking Glass 追加カテゴリの表示を Playwright で確認。
