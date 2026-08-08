# レビュー: task-260802212220-pion-gate3-frontend-browser-harness

## 判定

NEEDS_REVISION

## 理由・申し送り

- 現行コードとの契約自体は整合している。`RTCTalkClient`は`failed`からproductionのrestart経路を通り、`createOffer({ iceRestart: true })`を既存`RTCPeerConnection`上で実行する。依存タスクの固定WAV、契約サービス、Consul、process所有部品も対象branchへ取り込み済みである。
- 高リスク統合試験の所有権と生存期間が未確定である。契約サービス、Consul、Pion process、Frontend build、ChromiumをGo試験とPlaywrightのどちらが起動・監督するか、起動順、readiness、異常終了時を含む逆順cleanup、実行commandをtask.mdで一意にする必要がある。既存PionがFrontendとRTC APIをsame-origin配信できるため、追加proxyを許す曖昧な選択肢も削り、既存originを使う方針へ固定できる。
- 合否の観測点が不足している。initial/update Offerとcandidateのrequest body、revision 2と同一session ID、DataChannelが再生成されていないこと、`text_ch`/`telop_ch`の受信、利用者text・応答text、合成音声、2 turn目、override削除後のnative ICE状態について、どのHTTP・browser・下流台帳またはRTC statsを正本にするかを指定する必要がある。「観測する」「完走」だけでは、DOM表示やtest内自己申告だけでも合格できてしまう。
- 時刻と失敗条件が未確定である。page ready、initial接続、各turn、restart、停止の段階別期限と、期限超過、`RTCPeerConnection`捕捉数不一致、closed instance、getter変更不能、単発発火違反、property復元失敗、update Offer欠落、子process非0終了、cleanup失敗をtest failureにする条件を明記する必要がある。
- 最小実装は既存`internal/gate3`部品とPionのsame-origin static配信を再利用し、HTTP status matrix、障害注入proxy、独自JSON protocolを追加しない方針でよい。実装時のコメント判断はtask.mdへ規約を複製せず、`documents/rules/source-comments.md`を直接参照すること。
