# production相当環境でPion切替リハーサルを実行する

## 背景 / 目的

Phase 4で作った実際のimage、compose、network、runbookをproduction相当環境で一度通し、Pionへ停止切替して
問題時にaiortcへ戻せるかだけを判定する。移行判断に不要な性能評価や網羅試験は行わない。

## 完了条件（受け入れ条件）

- [ ] 運用と同じpublic IPv4、固定UDP port、NAT、firewallで、runbookどおりaiortc停止からPion readinessまで完了する。
- [ ] ChromeとFirefoxで各1回、Pionへの接続、1 turnの会話、利用者/応答text、telop、非無音の合成音声を確認する。
- [ ] session終了後に既存statuses/metricsでactive sessionと下流接続が収束し、増加し続けるresourceがない。
- [ ] production相当のrestart policyでPion processを1回停止し、再起動・readiness復旧後に新規sessionを受理する。
- [ ] Pionを停止してaiortcを復旧し、ChromeとFirefoxで各1回の同じsmoke testをFrontendと下流serviceの
      rebuildなしに完了する。
- [ ] commit、環境、command、各段階の所要時間、結果、未観測、残リスクを`artifacts/gate-4-result.md`へ記録し、
      Gate 4をPASSまたはFAILで判定する。必須確認の失敗時は証拠を保存し、原因不明のままPASSにしない。

## 設計判断

- 新しいharness、metric、障害注入、反復試験は追加せず、runbookの手動smoke testをGate 4の証拠とする。
- latencyと音質は会話不能、明確な無音・速度異常・実用不能な遅延だけをFAILとし、aiortcとの詳細比較を行わない。

## スコープ境界

- 本タスク: Phase 4の実行、最小証拠、Gate 4判定、実測で判明したrunbook誤記の修正。
- 依存: production network、container、排他的compose、cutover runbook。
- スコープ外: soak、network impairment matrix、負荷/性能比較、TURN、IPv6、Phase 5実運用切替。

## 実装方針

既存のstatuses、health、metrics、browser UIだけを観測点に使う。実装不具合が見つかった場合は本taskへ
抱え込まず、原因箇所を直す小さなPhase 4 taskを起票してGate 4を再実行する。

## テスト

受け入れ条件の一連のリハーサルを1回実行する。repository testの全再実装やGate専用clientは追加しない。

## ドキュメント同期の要否

要。Gate 4結果と実測所要時間をtask artifactへ残し、`documents/migration/pion/roadmap.md`へPhase 4の判定だけを反映する。
PASSまではcurrent architectureをPionへ書き換えない。
