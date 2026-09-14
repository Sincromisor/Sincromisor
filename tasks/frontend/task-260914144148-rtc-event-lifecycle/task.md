# RTCイベントの通知順序と旧接続の購読解除を修正

## 背景 / 目的

基本設定の接続状態が接続確立後も `ice:checking` に留まるとの報告を受け、RTCイベントから表示・復旧・受信処理へ至る経路を調査する。
診断イベントを接続表示へ変換する際、保持状態の更新より通知が先行しており、ICE・シグナリング表示が1イベント分遅れていた。

## 完了条件

- [x] ICEの確認・接続・確立・切断・失敗・復帰とシグナリングの変更を、その通知内で接続表示へ反映する。
- [x] 接続済みの診断値が残っていても、明示停止では停止中・停止済みを表示する。
- [x] 接続世代終了後のICE・シグナリング・トラック・DataChannelイベントが診断と受信処理へ届かない。
- [x] 停止後の候補送信完了・失敗で復帰・失敗を誤通知せず、致命的失敗では切断猶予と診断タイマーを解除する。
- [x] 対象の回帰テスト、型検査・ビルド、変更ファイルの静的検査・整形が成功する。

## 調査と修正

- `sincroAppDebugSubscriptionFlow` は最新状態を保存してから `rtc_state` と `connection_state` を通知する。
- `sincroAppConnectionState` は停止中・停止済みをICE診断値より優先する。
- `rtcPeerConnectionEvents`、`rtcRemoteTrackHandlers`、`rtcDataChannels` は既存の接続世代の `AbortSignal` を購読へ渡す。PeerConnectionを閉じるだけでは購読を解除できず、従来の世代確認は診断・受信処理を保護していなかった。
- `RTCTalkClient` は候補書き出し後と候補送信失敗時にも世代を確認し、致命的失敗時のタイマーを解除する。
- 接続開始・停止の上位制御、ICE復旧の猶予と重複抑止、サーバーの接続・トラック・DataChannel登録も確認した。今回の修正はフロントエンドの通知・購読とその後始末に限定し、通信契約と再接続方式は変更しない。

## 確認結果

- 変更前のコードへ回帰テストを適用し、診断状態の通知遅延、停止後の候補送信失敗による再終了、停止後の誤った復帰通知を再現した。
- `npm run test --prefix sincromisor-frontend -- src/features/rtc src/app/controller/__tests__/sincroAppController.test.ts`: 9ファイル・58件成功。
- `sincromisor-frontend` で `npm run build`: 型検査とViteビルド成功。
- 変更したTypeScriptのBiome検査とMarkdownのPrettier検査が成功。
- コメント点検: PASS。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md) に通知順序・停止表示の優先順位・世代終了時の購読解除を反映した。設計索引からの既存リンクを確認した。
