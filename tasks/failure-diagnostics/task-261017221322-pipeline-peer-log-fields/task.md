# 中央ログでパイプラインの通信相手を保持する

## 背景 / 目的

再初期化ログは切断元をserviceへ記録するが、Vectorは同名属性をComposeのサービス名へ上書きする。中央検索では切断元を失う。

優先度: 最優先。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

なし。単独で着手できる。

## 担当範囲

- [sincromisor-server/sincro-rtc/internal/pipeline/reset.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/reset.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/observability_logs_test.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/observability_logs_test.go)
- [configs/vector.toml](../../../configs/vector.toml)
- [configs/vector-tests.toml](../../../configs/vector-tests.toml)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: ログ基盤の置換、通信契約、切断原因の追加。

## 設計判断

- serviceはCompose上の出力元、peerは通信相手に統一する。再初期化ログの切断元をpeerへ移し、同じ衝突がある今回のログ呼出しだけを修正する。
- Vectorの配置識別子の上書きは偽装防止として維持する。既存検索のserviceからpeerへの変更を文書に明記する。

## 完了条件

- [x] 人工的なVoiceSynthesizer切断ログがVector通過後にservice=sincro-rtcとpeer=VoiceSynthesizerを保持する。
- [x] session_id、generation、causeを保持し、送信元の偽装host/serviceは採用しない。

## 確認方法

- 既存observability_logs_test.goとVectorの固定データに各1例を追加し、Goの対象テストとvector testを実行する。中央サービスの起動は最終結合タスクへ委ねる。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。

## 実施結果

再初期化ログの切断元を`peer`へ変更し、VoiceSynthesizerを対象とするGoログ試験とVector固定データを追加した。Vectorの配置識別子の上書きは既存実装を維持した。

`GOCACHE=/tmp/sincro-go-cache go test ./internal/pipeline -run TestPipelineResetLogs`と、既存`timberio/vector:0.58.0-debian`による`vector test`（7件）が成功した。Vector試験はネットワークなしの一時コンテナで実行し、終了時に削除した。イメージの作成・取得はない。中央サービスでの確認は結合タスクで行う。コメント点検: PASS。
