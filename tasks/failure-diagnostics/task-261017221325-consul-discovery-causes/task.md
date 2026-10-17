# GoのConsul探索失敗を原因別に記録する

## 背景 / 目的

GoのConsul探索は通信エラー、HTTP異常、応答破損、不正な候補をrequest_failedへまとめる。fallbackが選ばれた理由を切り分けにくい。

優先度: 中。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [中央ログでパイプラインの通信相手を保持する](../task-261017221322-pipeline-peer-log-fields/task.md)

## 担当範囲

- [sincromisor-server/sincro-rtc/internal/pipeline/discovery/resolver.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/discovery/resolver.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/client/connection.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/connection.go)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: サービス発見の方式変更、Python探索の再実装、Consulへの新しい接続。

## 設計判断

- 既存Endpointの診断情報に有限な原因、HTTP状態、探索時間を必要な範囲で保持し、timeout、connection_failed、http_failure、invalid_responseを区別する。
- consul_disabledとno_healthy_instanceは維持する。接続相手と探索元Consulを混同せず、URL・応答本文・認証情報を記録しない。

## 完了条件

- [x] HTTP代役の503、不正JSON、正常候補なしと接続時間切れをログで区別できる。
- [x] fallbackの選択・候補検証・リダイレクト制約を変更せず、診断だけを拡充する。

## 確認方法

- 既存resolverのHTTP代役試験と接続側ログ試験を拡張し、対象Goテストを実行する。

## 文書同期

- [documents/design/infrastructure/consul.md](../../../documents/design/infrastructure/consul.md)
- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。

## 実施結果

既存EndpointへHTTP状態と探索時間を付け、通信・時間切れ・HTTP異常・不正応答を分類した。接続側ログでは相手と探索元を分離し、代替接続先の選択と検証条件を維持した。

`go test ./internal/pipeline/discovery ./internal/pipeline/client`が成功した。503、不正JSON、正常候補なし、時間切れのHTTP代役とログを照合し、リダイレクト拒否・サイズ制約・候補検証・本文非出力も確認した。コメント点検: PASS。
