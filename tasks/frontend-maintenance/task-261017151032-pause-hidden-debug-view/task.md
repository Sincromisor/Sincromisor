# 非表示の診断表示をActivityで休止

## 背景 / 目的

診断パネルを閉じてもスナップショット購読が続き、非表示タブにも通常の描画処理が走る。React 19.3.0のActivityを、先行タスクで分けた表示部分に適用する。

優先度: 中。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

[task-261017151032-separate-debug-tracking-dom](../task-261017151032-separate-debug-tracking-dom/task.md) の完了後に着手する。

## 担当範囲と設計判断

- [`src/app/shell/sincroPageAppShell.tsx`](../../../sincromisor-frontend/src/app/shell/sincroPageAppShell.tsx) と [`src/features/debug/react/debugConsole.tsx`](../../../sincromisor-frontend/src/features/debug/react/debugConsole.tsx)、必要な表示部分だけを担当する。
- 診断パネルの表示状態を渡し、スナップショットの購読部分をActivity境界内に置く。タブごとの表示部分もActivityで可視性を切り替え、非表示時の描画優先度を下げる。
- 追跡用プレビュー、受信音声の `rtcAudio` とタブ選択状態は常設のまま保つ。設定パネル、診断データの収集・履歴保持・通知頻度、RTC、カメラ・追跡制御は対象外。

## 完了条件

- [x] 診断パネルを閉じると表示用スナップショットの購読を解除し、再表示時に最新値を購読する。非表示中の更新をReact状態へ蓄積しない。
- [x] タブ選択と必要な入力状態を保持する。Activityで非表示の子にもプロパティ更新による低優先度の再描画はあり得るため、全描画ゼロを要件にしない。
- [x] 非表示状態からの初回起動・再表示でも追跡用DOMと `rtcAudio` が存在し、同一性と映像・追跡・受信音声再生の継続を維持する。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- 型検査、購読の解除・復元と最新値反映を観測する小さな結合確認。開閉を一往復し、購読が増殖しないことを確認する。
- 開発ブラウザーで診断を閉じたまま追跡開始→表示→タブ切替→閉じる→再表示を確認する。追跡用DOM・映像・受信音声再生とタブ選択を確認し、静的HTMLの検査だけで完了しない。
- Effectと追跡用DOMの生存期間に関わるため仕様の独立レビューを行う。

## 文書同期

[setting-and-debug-ui/debug-design.md](../../../documents/design/frontend/setting-and-debug-ui/debug-design.md) に休止対象と、継続する診断収集・追跡の範囲を同期する。

## 参照

[React Activity公式仕様](https://react.dev/reference/react/Activity)（参照日: 2026-10-17）。非表示時のEffect解除と状態保持を採用し、初回非表示時のEffect未実行に依存する追跡初期化や受信音声の接続先DOMを境界内に入れない。

## 実施結果

- 診断パネルの可視性をActivityへ渡し、表示用購読と各タブのEffectを非表示時に解除する。常設の映像・マーカー・受信音声とタブ選択は境界外に保つ。独立仕様レビューはAPPROVED。
- 型検査と初回非表示DOMテスト、Chrome結合確認が成功。非表示時は購読なし、開閉2往復で登録2回・解除2回、再表示で最新値0.05を反映した。非表示中は入力欄へ更新を転記せず、選択タブと詳細欄の開閉状態を保持した。
- DOM分離時のブラウザー確認を再実行し、初回非表示から実MediaPipeとローカルWebRTCの接続に成功した。DOMとsrcObjectの同一性を保ち、追跡6→52回、音声再生0.14→2.27秒へ進んだ。合成映像・無音音声を使い実カメラは未確認。
- 11件を反映した最終ビルドとフロントエンドBiomeが成功。全体テストは689成功、既存3件スキップ。変更文書とコメントを点検した。
