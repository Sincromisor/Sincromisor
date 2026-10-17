# 追跡映像と受信音声のDOMを診断表示から分離

## 背景 / 目的

診断画面の内部にある `characterGazeVideo` を `CharacterGaze` が生成時に取得して保持している。また、`AudioPanel` 内の `rtcAudio` は受信トラック到着時にRTC処理が取得して接続する。後続で診断表示の購読を休止しても、追跡と受信音声に使う同じDOMを維持できる境界が必要である。

優先度: 中。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

[task-261017151032-stabilize-debug-subscription](../task-261017151032-stabilize-debug-subscription/task.md) の完了後に着手する。

## 担当範囲と設計判断

- [`src/features/debug/react/debugConsole.tsx`](../../../sincromisor-frontend/src/features/debug/react/debugConsole.tsx)、[`src/features/debug/react/panels/gazePanel.tsx`](../../../sincromisor-frontend/src/features/debug/react/panels/gazePanel.tsx)、[`src/features/debug/react/panels/gazePreview.tsx`](../../../sincromisor-frontend/src/features/debug/react/panels/gazePreview.tsx)、[`src/features/debug/react/panels/audioPanel.tsx`](../../../sincromisor-frontend/src/features/debug/react/panels/audioPanel.tsx) と必要な [`src/styles/sincroDebugConsole.css`](../../../sincromisor-frontend/src/styles/sincroDebugConsole.css) を担当する。
- 診断画面を、常設の枠・タブ選択・追跡用プレビュー・受信音声要素と、診断スナップショットを購読して描画する部分に分ける。購読は後者へ移す。映像・音声DOMの所有者はReactの常設部分とし、既存の視線タブ内の見え方を保つ。
- 追跡用DOMの複製、別のカメラ取得、MediaStreamの再接続、追跡制御の移植は行わない。本タスクではActivityによる休止や通知頻度変更は行わない。

## 完了条件

- [x] `characterGazeVideo`、`characterGazeMarker`、`eyeTarget`、`rtcAudio` が各1個であり、アプリ初期化前から存在し、タブ・パネルの開閉でも同じDOMを維持する。
- [x] 追跡用DOMと受信音声DOMを診断データの購読部分の外に置き、後続で購読部分だけを休止できる。カメラ・追跡・受信トラックの開始停止と接続は既存制御が所有し続ける。
- [x] 視線タブのプレビューとマーカー、他タブの配置、タブ選択の保持を維持する。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- 型検査と対象の表示・追跡テスト。DOMの一意性・同一性と初期化順を確認する小さな結合確認を残す。
- 開発ブラウザーで診断画面を閉じた状態から起動し、視線タブ表示→他タブ→閉じる→再表示で映像とマーカーを確認する。DOMを再取得して済ませず、既存参照が同一であることを観測する。診断画面を一度も開かずRTC受信音声を接続でき、開閉後も同じ `rtcAudio` と接続済み `srcObject` が保たれることを確認する。
- 生存期間を扱うため仕様の独立レビューを行う。カメラ停止・再取得の不具合が出た場合は原因を解消してから完了する。

## 文書同期

[app-shell.md](../../../documents/design/frontend/app-shell.md) と [setting-and-debug-ui/debug-design.md](../../../documents/design/frontend/setting-and-debug-ui/debug-design.md) に、常設の追跡映像・受信音声DOMと診断表示の所有境界を同期する。

## 参照

[`src/features/gaze/characterGaze/characterGaze.ts`](../../../sincromisor-frontend/src/features/gaze/characterGaze/characterGaze.ts)、[`src/app/controller/sincroCharacterGazeOverlay.ts`](../../../sincromisor-frontend/src/app/controller/sincroCharacterGazeOverlay.ts) は参照の保持方法を確認するために読む。

[`rtcRemoteTrackHandlers.ts`](../../../sincromisor-frontend/src/features/rtc/rtcRemoteTrackHandlers.ts) の受信音声DOMへの接続も確認する。通信契約と受信トラック制御は変更しない。

## 実施結果

- 枠・タブ選択・映像とマーカー・rtcAudioを常設し、診断購読をDebugConsolePanelsへ分離した。視線詳細だけをportalで元の配置先へ描画するためCSSとプレビュー配置は維持できる。独立仕様レビューはAPPROVED。
- 型検査・対象Biome、追跡・診断・初期化の103テストと初期DOM一意性の1テストが成功した。
- Chromeで診断を閉じた状態から合成映像を実MediaPipeへ接続し、ローカルのPeerConnection同士で無音トラックを受信した。表示→タブ切替→閉じる→再表示で4つのDOM・保持済み映像参照・双方のsrcObjectが同一であり、追跡コールバック6→48回、音声再生時刻0.14→2.21秒へ進むことを確認した。マーカーとタブ選択も維持した。
- 実カメラ・可聴音声は使用せず、個人の映像・音声原本は保存していない。
