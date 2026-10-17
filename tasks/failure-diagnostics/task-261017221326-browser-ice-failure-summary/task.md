# ICE失敗時の限定した診断値を中央へ送る

## 背景 / 目的

rtcIceDiagnosticsは候補種別・接続状態などを端末ログへ残すが、中央にはrtc/failedなどしか届かず、端末を離れると切り分けに使えない。

優先度: 中。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [ブラウザー診断へシグナリングの操作とHTTP状態を追加する](../task-261017221326-browser-signaling-diagnostics/task.md)

## 担当範囲

- [sincromisor-frontend/src/features/rtc/diagnostics/rtcIceDiagnostics.ts](../../../sincromisor-frontend/src/features/rtc/diagnostics/rtcIceDiagnostics.ts)
- [sincromisor-frontend/src/features/rtc/rtcBundleDiagnostics.ts](../../../sincromisor-frontend/src/features/rtc/rtcBundleDiagnostics.ts)
- [sincromisor-frontend/src/shared/logging/browserDiagnostics.ts](../../../sincromisor-frontend/src/shared/logging/browserDiagnostics.ts)
- [sincromisor-server/sincro-rtc/internal/signaling/http_diagnostics.go](../../../sincromisor-server/sincro-rtc/internal/signaling/http_diagnostics.go)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: STUN/TURN設定変更、候補アドレス収集、常時getStats転送、マルチブラウザー試験。

## 設計判断

- 既存のICE失敗時収集を再利用し、rtcイベントに任意のice_summaryを付ける。中身はsignaling_state、gathering_state、pair_state、local_type、remote_type、pair_count、succeeded_pair_count、rtt_msだけに限定する。
- 状態・候補種別は採用WebRTC型の列挙値、件数は0〜1000000の整数、rtt_msは0以上の有限数とする。件数範囲は既存診断カウンター上限に合わせる。取得できない値は省略し、選択ペアなしを作り話で埋めない。
- IP、ポート、候補ID、SDP、userAgent、任意のgetStats結果を送らない。既存イベントと任意項目なしの形式を維持し、異なる要約を集約で混同しない。
- 非同期のgetStats開始時に会話IDを捕捉し、取得中に接続が切り替わっても新しい会話へ誤帰属させない。開始時に会話IDがなければ省略し、完了時の現在値で補わない。
- 診断API契約変更として送受信側・設計を同時更新する。定常統計の転送は追加せず、失敗捕捉の既存回数制御を維持する。

## 完了条件

- [ ] ICE失敗の固定統計から、接続状態、候補種別、成功ペア数と取得できるRTTが中央受信ログへ残る。
- [ ] 欠損値・選択ペアなしを扱え、未知キー・不正列挙・負数・非有限値・上限外件数を受信で拒否する。
- [ ] rtc以外のイベントに付いたice_summaryは拒否する。非同期取得中に会話が切り替わっても、結果は開始時の会話IDへ対応付く。

## 確認方法

- 小さなICE固定統計のfixtureを新規作成し、既存収集処理とBrowserDiagnosticsの対象Vitest、Go受信契約試験、フロント型検査を実行する。取得途中の会話切替でも開始時のIDを保つことを確認する。APIのサイズ・同一オリジン・頻度制限の既存試験を維持する。実NAT環境の網羅は不要。

## 文書同期

- [documents/design/contracts/frontend-rtc.md](../../../documents/design/contracts/frontend-rtc.md)
- [documents/design/frontend/app-shell.md](../../../documents/design/frontend/app-shell.md)
- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

診断受付の通信契約変更として影響と同時更新条件を明記する。起票時に対象2タスクの独立仕様レビューを行う。
