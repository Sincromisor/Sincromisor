# ブラウザー診断へシグナリングの操作とHTTP状態を追加する

## 背景 / 目的

RtcSignalingHttpErrorはoperationとstatusを持つが、中央送信のBrowserDiagnosticsは例外名からfailedへ変換し、それらを失う。

優先度: 中。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

なし。単独で着手できる。

## 担当範囲

- [sincromisor-frontend/src/features/rtc/rtcSignalingHttp.ts](../../../sincromisor-frontend/src/features/rtc/rtcSignalingHttp.ts)
- [sincromisor-frontend/src/shared/logging/appLogger.ts](../../../sincromisor-frontend/src/shared/logging/appLogger.ts)
- [sincromisor-frontend/src/shared/logging/browserDiagnostics.ts](../../../sincromisor-frontend/src/shared/logging/browserDiagnostics.ts)
- [sincromisor-server/sincro-rtc/internal/signaling/http_diagnostics.go](../../../sincromisor-server/sincro-rtc/internal/signaling/http_diagnostics.go)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: シグナリング本体の再試行変更、追加診断エンドポイント、ICE統計。

## 設計判断

- 診断eventsの任意項目としてoperation（initial-offer/update-offer/candidate）とhttp_status（整数100〜599）を追加する。signalingイベントにだけ許可し、未取得は省略する。既存のreasonは維持する。
- 端末の集約キーに追加項目を含め、操作やHTTP状態が異なる診断を合算しない。任意context、URL、SDP、例外本文は受け付けない。
- HTTP境界で失敗情報を取得した時点から診断へ渡し、`handleGenerationFailure` が復旧する更新Offer・Candidateの404/410も記録対象にする。`terminalFailure` だけへ追加して取りこぼさず、同じ失敗を重複記録しない。
- 通信契約変更としてフロント・Go受信・設計を同一コミットで同期する。既存送信形式も受理するが、新形式は旧Goの未知項目拒否に抵触するため同時更新が必要と明記する。

## 完了条件

- [x] 404/410/429/503とHTTP状態を得られない通信失敗を、操作付きで受信側JSONへ残せる。
- [x] 未知操作、範囲外・非整数の状態、他イベントでの追加項目、任意属性を拒否する。同一オリジン、件数・サイズ・頻度制限を維持する。
- [x] 送信側集約で異なる操作・状態を混同せず、既存診断形式も通る。

## 確認方法

- BrowserDiagnosticsの対象Vitest、実送信処理のfixtureをGo受信試験へ渡す契約確認、既存http_diagnostics_test.goを実行する。フロントの型検査も行う。ブラウザーの全画面試験は不要。

## 文書同期

- [documents/design/contracts/frontend-rtc.md](../../../documents/design/contracts/frontend-rtc.md)
- [documents/design/frontend/app-shell.md](../../../documents/design/frontend/app-shell.md)
- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

診断受付の通信契約変更として影響と同時更新条件を明記する。起票時に対象2タスクの独立仕様レビューを行う。

## 実施結果

HTTP実行境界で操作と取得済み状態を記録し、再試行警告や終端失敗の重複を除いた。404/410による復旧経路にも診断が残る。送信待ち行列は追加項目を含めて集約し、Goはsignalingだけに有限の操作・整数状態を許可する。null・未知値・他イベントへの追加も拒否する。

実送信JSONを共通fixtureと照合するVitest、HTTP境界、既存会話復旧の3ファイル43件とフロント型検査が成功した。Goの診断受信試験はfixture・旧形式・不正値・既存同一オリジンと上限を含め成功した。Biomeは既存再試行関数の複雑度警告のみ。文書とコメントを点検し、通信変更と同時更新条件を同期した。ブラウザー全画面試験はタスク指定どおり行っていない。
