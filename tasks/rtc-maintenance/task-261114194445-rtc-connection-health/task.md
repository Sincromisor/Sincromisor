# RTC接続全体の状態を接続表示へ反映する

## 背景 / 目的

WebRTC実装のモダナイズレビューで挙げた指摘1への対応。2026-11-14、HEAD `0268ee7d9`で関連コードを確認した。

現在はICEの`connected` / `completed`通知と、Answer適用・候補送信の完了でRTCエラー表示を解除する。`connectionstatechange`は購読していないため、ICEが接続済みのままDTLSが失敗しても接続全体の障害を通知できない。模擬PeerConnectionで`connectionState`だけを`failed`へ変更すると、接続管理への通知が発生しないことを確認済み。実ブラウザーでのDTLS障害再現は未実施である。

暗号通信を含む接続全体の状態を表示へ反映し、接続交渉の成功と実際の接続成功を区別する。

## 完了条件（受け入れ条件）

- [x] 現世代の`connectionstatechange`を購読し、ICEが`connected`のまま接続全体が`failed`になった場合も、既存のRTCエラー表示へ通知する。
- [x] ICEの成功やAnswer適用・候補送信の完了だけではRTCエラーを解除せず、現世代の`connectionState === "connected"`を確認して接続成功・復帰を通知する。通知順が前後しても失敗表示を誤って解除しない。
- [x] ICEの一時切断猶予、再接続、候補送信の直列化、404/410時の接続置換、明示終了は既存契約を維持する。DTLS単独の失敗をICE失敗と取り違えて新しい自動再接続を起動しない。
- [x] 停止・世代置換後は追加した購読も解除され、旧世代の成功・失敗が現在の表示を変更しない。
- [x] 接続表示の判定基準を[共通枠組み](../../../documents/design/frontend/app-shell.md)へ反映する。

## 設計判断とスコープ

変更はフロントエンドの接続状態の観測と表示への通知に限定する。ICE復旧処理と接続全体の表示判定を分けるが、PeerConnectionや音声トラックの所有者、終了処理、再接続方針は変更しない。既存の失敗通知・明示再開始の導線を使う。

Pion側の[接続準備判定](../../../sincromisor-server/sincro-rtc/internal/rtc/readiness.go)と[RTC契約](../../../documents/design/contracts/frontend-rtc.md)を照合する。サーバー実装、HTTP・DataChannel形式、診断JSONへの状態値追加は対象外とする。

## 主な変更範囲

- [RTCイベント購読](../../../sincromisor-frontend/src/features/rtc/rtcPeerConnectionEvents.ts)と[接続生成](../../../sincromisor-frontend/src/features/rtc/rtcPeerConnectionFactory.ts): 世代のAbortSignalを使った接続全体の状態通知。
- [接続状態処理](../../../sincromisor-frontend/src/features/rtc/rtcConnectionStateHandler.ts)と[RTCTalkClient](../../../sincromisor-frontend/src/features/rtc/rtcTalkClient.ts): ICE復旧判断と表示判断の分離、交渉完了時の無条件解除の修正。
- [上位のRTC制御](../../../sincromisor-frontend/src/app/controller/sincroRtcSessionController.ts): 既存のエラー設定・解除への接続確認。

## 確認方法

- ICE接続済み・接続全体失敗のイベント、交渉完了前後の状態通知、接続全体の復帰、停止後の遅着を既存RTC単体試験へ追加する。
- `npm run test -- src/features/rtc`で既存の再接続・世代解除も確認する。型検査と変更したTypeScriptのBiome検査を実施する。
- 表示への接続は既存の上位制御試験で確認する。DTLS障害の実ブラウザー再現や複数ブラウザーでの網羅試験は必須としない。

## 参照仕様

[W3C WebRTCの接続状態](https://www.w3.org/TR/webrtc/#dom-rtcpeerconnectionstate)を2026-11-14に参照した。`connectionState`がICEとDTLSの状態を反映する定義を採用する。新しい通信方式やライブラリは導入しない。

## 実装・確認結果

接続全体のイベントを世代のAbortSignalで購読し、失敗通知と成功時のRTCエラー解除をICE復旧処理から分離した。設定画面にも同じ判定を届けるため、既存の診断イベントからアプリの接続表示への経路を更新した。停止表示の優先順位とICE復旧・交渉・終了の所有者は維持している。Pionの接続準備判定とRTC契約を照合し、通信形式の変更はない。共通枠組みを同期し、変更箇所と直接の通知経路のコメントを点検した。

- `npm run test -- src/features/rtc src/app/controller/__tests__/sincroAppController.test.ts src/app/controller/__tests__/sincroAppCalibration.test.ts`: 87件成功。接続全体のみの失敗、Answer前・候補送信中・送信後の通知順、復帰、停止・置換後の遅着、上位のエラー設定・解除、設定画面の接続表示を確認。
- TypeScript型検査、変更TypeScriptのBiome、変更MarkdownのPrettier、タスク検査: 成功。
- DTLS障害の実ブラウザー再現は実施していない。模擬PeerConnectionの状態通知で確認した。
