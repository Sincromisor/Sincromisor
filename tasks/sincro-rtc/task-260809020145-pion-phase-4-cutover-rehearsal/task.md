# production相当環境でPion切替リハーサルを実行する

## 背景 / 目的

Phase 4で作った実際のimage、compose、network、runbookをproduction相当環境で一度通し、Pionへ停止切替して
Pionへ停止切替できるかを判定する。Pion切替後の障害はaiortcへ戻さずforward-fixし、移行判断に不要な性能評価や網羅試験は行わない。

## 完了条件（受け入れ条件）

- [ ] 運用と同じpublic IPv4、固定UDP port、NAT、firewallで、runbookどおりaiortc停止からPion readinessまで完了する。
- [ ] Gate 3で成立済みのChrome経路で1回、Pionへの接続、1 turnの会話、利用者/応答text、telop、非無音の合成音声を確認する。
- [ ] session終了後に既存statuses/metricsでactive sessionと下流接続が収束し、増加し続けるresourceがない。
- [ ] 切替でFrontendと下流serviceをrebuildしない。
- [ ] commit、環境、command、各段階の所要時間、結果、未観測、残リスクを`artifacts/gate-4-result.md`へ記録し、
      Gate 4を判定する。移行必須条件の未達だけをFAILとし、必須条件を観測できない場合は必要な観測点と解除条件を記録して
      `blocked`にする。必須確認の失敗時は証拠を保存し、原因不明のままPASSにしない。

## 設計判断

- 新しいharness、metric、障害注入、反復試験は追加せず、runbookの手動smoke testをGate 4の証拠とする。
- latencyと音質は会話不能、明確な無音・速度異常・実用不能な遅延だけをFAILとし、aiortcとの詳細比較を行わない。
- Pion process crash自動復帰は移行必須ではない運用強化としてGate 4から外す。必要な場合は、根本原因、移行との関係、
  最小受け入れ条件を持つ独立taskで扱う。
- aiortcのimage / startup確認は診断情報に留め、rollback後の会話成立はGate 4の合否条件にしない。Pion切替後の障害は
  aiortcへのrollbackではなくforward-fixで扱う。
- 実下流の応答本文は固定文字列と比較しない。browser UIで利用者/応答textとtelopが表示され、合成音声を聴取できればよい。
  Firefoxや別のbrowserは、aiortcで同じ実環境smokeが成立した証拠がある場合だけ独立して確認する。

## スコープ境界

- 本タスク: Phase 4の実行、最小証拠、Gate 4判定、実測で判明したrunbook誤記の修正。
- 依存: production network、container、排他的compose、cutover runbook。
- スコープ外: soak、network impairment matrix、負荷/性能比較、TURN、IPv6、Phase 5実運用切替。

## 実装方針

既存のstatuses、health、metrics、browser UIだけを観測点に使う。Pionで1回実行したら判定し、aiortc起動は必要時の
診断に留める。追加の前提監査、Docker挙動調査、browser matrix、新しいoracleは行わない。実装不具合で移行必須条件を満たせない場合だけ、
再現手順と最小受け入れ条件を持つ小さなtaskを起票する。過去artifactと判定履歴は書き換えない。

## テスト

受け入れ条件の一連のリハーサルを1回実行する。repository testの全再実装やGate専用clientは追加しない。

## ドキュメント同期の要否

要。Gate 4結果と実測所要時間をtask artifactへ残し、Pion切替後のforward-fix方針とPhase 4の判定を
`documents/migration/pion/`へ反映する。PASSまではcurrent architectureをPionへ書き換えない。
