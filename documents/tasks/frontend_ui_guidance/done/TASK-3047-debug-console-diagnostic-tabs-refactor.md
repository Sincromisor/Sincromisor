# TASK-3047 Debug Console 診断タブ再設計とコンポーネント分割

- 作成日: 2026-05-07
- ステータス: Done
- 優先度: High

## 目的

`DebugConsole.tsx` に集中している診断 UI を、監視ダッシュボードと用途別詳細タブに再設計し、1画面へ無理に全要素を詰め込む構成を解消する。

## 背景

- 現在の Debug Console は React 化済みだが、広い画面では複数パネルを同時表示する grid layout が残っている。
- `src/react/debug/DebugConsole.tsx` が長大化しており、Overview、Transport、Audio、Channels、Face & Gaze、SDP の JSX と操作ロジックが1ファイルに集中している。
- 1366px 以下ではタブ表示になる一方、desktop では全体表示が優先されるため、結局スクロールが必要になりやすい。
- 開発者が最初に見るべき情報と、必要時だけ触る調整項目・生ログ・SDP が同じ密度で並び、診断時の視線移動が重い。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3015-debug-console-react-migration-and-diagnostics-core-split.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3037-debug-console-mobile-header-tabs.md`

## スコープ

- Debug Console の情報設計見直し
- 全 viewport でのタブ型詳細表示への統一
- Overview を診断サマリとして再構成
- Debug Console panel / control / display primitive のコンポーネント分割
- `sincroDebugConsole.css` の layout / responsive 調整

## 非対象

- RTC / VAD / CharacterGaze のアルゴリズム変更
- `DebugConsoleManager` の diagnostics snapshot 契約の大幅変更
- 新しい診断メトリクスの追加
- 右側ツールメニューや設定パネル全体の再設計
- サーバー側 WebRTC endpoint / payload の変更

## 対応方針

1. Debug Console は全画面幅で「常時タブ UI」を基本とし、広い画面でも全パネル同時表示へ戻さない。
2. 初期タブは `Status` とし、接続・音声・視線・DataChannel の重要状態をスクロールなしで把握できる診断サマリにする。
3. 詳細タブは技術カテゴリではなく、開発者の探し方に合わせて `Audio`、`RTC`、`Messages`、`Gaze`、`Raw` に整理する。
4. Audio / Gaze の調整項目は、状態確認領域の下または collapsible details に置き、監視と調整の密度を分ける。
5. Logs / SDP など長文領域はタブ内の固定高さスクロールに閉じ込め、Debug Console 全体の縦スクロールを最小化する。

## 分割案

```text
sincromisor-frontend/src/react/debug/
  DebugConsole.tsx
  DebugConsoleTabs.tsx
  panels/
    StatusPanel.tsx
    AudioPanel.tsx
    RtcPanel.tsx
    MessagesPanel.tsx
    GazePanel.tsx
    RawPanel.tsx
  components/
    DebugMetricGrid.tsx
    DebugMetricItem.tsx
    AudioMeter.tsx
    TrendGraph.tsx
    LogViewer.tsx
    RangeControl.tsx
```

## 実装タスク

1. 現在の `DebugConsole.tsx` の表示項目を、`Status` / `Audio` / `RTC` / `Messages` / `Gaze` / `Raw` に棚卸しする。
2. `DebugConsole.tsx` を snapshot 取得、manager 取得、active tab 管理、panel 切替の薄い container に縮退する。
3. `StatusPanel` を作成し、ICE / Signaling / RTT / mic / remote audio / VAD / gaze / channel 状態を診断サマリとして表示する。
4. `AudioPanel` を作成し、Local / Remote メーター、VAD 状態、入力制約、filter、Silero tuning、RMS tuning を整理して配置する。
5. `RtcPanel` を作成し、candidate、bitrate、packet loss、jitter、RTT、trend graph を集約する。
6. `MessagesPanel` を作成し、`text_ch`、`telop_ch`、RTC event timeline をログビューとして表示する。
7. `GazePanel` を作成し、camera preview、target marker、face/gaze 状態、tracking tuning を整理する。
8. `RawPanel` を作成し、offer SDP / answer SDP など長文の生データを扱う。
9. `AudioMeter`、`TrendGraph`、`LogViewer`、`RangeControl` など、重複する UI primitive を必要最小限で共通化する。
10. `sincroDebugConsole.css` を更新し、全 viewport で tabs を表示し、panel 単位の安定した高さ・内部スクロール・折り返しを定義する。
11. コメントが必要な箇所は、Google TypeScript style に沿って「なぜその構造にしているか」が分かる短い説明に留める。
12. 設計変更を反映する必要がある場合は `documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` の更新要否を確認する。

## 完了条件

- Debug Console が全 viewport でタブ型インタフェースとして表示される。
- desktop でも全パネル同時表示にならず、初期表示は診断サマリに集中している。
- `DebugConsole.tsx` が長大な JSX 本体ではなく、薄い container として読める。
- 各 panel が独立した React component に分割され、表示責務が追いやすい。
- Audio / Gaze の詳細調整は、通常の状態確認を邪魔しない位置または折りたたみ領域にある。
- Logs / SDP は Debug Console 全体ではなく、各 viewer 内でスクロールする。
- 既存の `DebugConsoleManager` snapshot / callback 経路を壊さず、RTC 停止ボタンが従来通り動作する。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認

- `simple-vrm` desktop で Debug Console を開き、`Status` 初期表示が1画面で把握しやすいことを確認する。
- `simple-vrm` mobile 幅で tabs が折り返しても操作しやすく、header / close button / panel content が重ならないことを確認する。
- `Audio` タブで local / remote meter と VAD tuning が表示・操作できることを確認する。
- `RTC` タブで主要 metrics と trend graph が表示されることを確認する。
- `Messages` タブで text / telop / event log が内部スクロールで確認できることを確認する。
- `Gaze` タブで camera preview と tracking tuning が表示・操作できることを確認する。
- `Raw` タブで offer / answer SDP が内部スクロールで確認できることを確認する。

## 実施メモ

- 本タスクは UI 表示思想の整理と React component 分割が主目的であり、診断データ収集ロジックの変更は最小限にする。
- `DebugConsoleManager` に新しい責務を戻さず、React view 側の構造整理として進める。
- 実装変更時は、設計ドキュメント更新が必要かを完了前に必ず確認する。

## 完了メモ

- 完了日: 2026-05-07
- `DebugConsole.tsx` を snapshot 購読、manager 取得、active tab 管理、panel 切替の container に縮退した。
- `DebugConsoleTabs.tsx`、`panels/*Panel.tsx`、`components/*` を追加し、表示責務を Status / Audio / RTC / Messages / Gaze / Raw に分割した。
- `sincroDebugConsole.css` を全 viewport 常時 tabs + 単一 panel 表示へ更新し、desktop の全パネル同時表示を撤去した。
- 設計変更は `documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` に反映した。
- `cd sincromisor-frontend && npm run build` 成功。
- Playwright で `simple-vrm` desktop / mobile 幅の Debug Console を確認し、単一 panel 表示、Audio / RTC タブ表示、mobile 横 overflow なしを確認した。
