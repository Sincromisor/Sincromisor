# Pion移行Gateの受け入れ条件を移行目的へ限定する

## 背景 / 目的

Gate 3とGate 4で、移行の成立を示す以上の条件が受け入れ条件へ入り、実装・環境調査・再試行を
膨らませた。直近ではPion containerのcrash自動復帰をGate 4必須条件としたが、これはaiortcから
Pionへの切替・会話・rollbackを示す条件ではなく、Pionだけに追加した運用強化要件だった。

移行Gateを、aiortcからPionへ安全に切り替えられることを判定する最小条件へ戻す。運用品質、
詳細性能、障害注入、test harnessの拡張は、移行を直接阻害する証拠がある場合だけ独立taskで扱う。

## 完了条件（受け入れ条件）

- [ ] `documents/migration/pion/validation-plan.md` と `implementation-phases.md` に、Gate条件を追加する
      判定規則を記す。必須条件は、移行固有の不変条件、既存確認で代替できない理由、既存の観測方法、
      未達時に切替を止める理由をすべて持つものだけとする。
- [ ] Gate 3 / Gate 4の現行条件を「移行必須」「既存testの証拠」「独立した運用強化」に分類し、
      移行必須ではないPion process crash自動復帰をGate 4の受け入れ条件・検証計画・runbookから外す。
- [ ] Gate実行中に新しいharness、設定、運用要件が必要になった場合は、Gateへ追加せず、根本原因・
      移行との関係・最小受け入れ条件を持つ別taskへ切り出す規則を記す。
- [ ] GateのFAILは、移行必須条件の未達だけで決める。観測点不足は設計判断またはtest整備taskとして
      区別し、未検証の追加要件をFAIL原因にしない。
- [ ] 移行必須条件を観測できない場合はPASSにせず、必要な観測点と解除条件を記録してGate taskを
      `blocked` にする。既存のPASS / FAIL / blocked運用とrunbookに同じ扱いを同期する。
- [ ] Gate 3 / Gate 4の過去artifactと判定履歴は書き換えず、現行のGate 4 taskと移行文書に
      適用範囲・次の再実行条件を同期する。
- [ ] `npm run tasks:check` と Markdown link確認が成功する。

## 設計判断

Gate 4に残す必須条件は、Pionでの現行Frontend接続、1 turnの会話・text・telop・非無音音声、
終了後のsession収束、aiortcへのrollback後にFrontendから新規接続・1 turnが成立すること
（Frontendと下流serviceのrebuildなし）である。
public UDP / NAT / firewallは、前者の接続成立を確認するための環境前提として扱う。

Pion固有のcontainer restart、soak、性能比較、障害注入、ブラウザmatrixの拡張は必須Gateにしない。
実運用の可用性要件として採用する場合だけ、aiortcとの同等性・担当・運用環境を明示した独立taskにする。

## スコープ境界

- 本タスク: Gate 3 / 4の受け入れ条件と実行規則、関連runbook、現行Gate 4 taskの同期。
- スコープ外: Pion / aiortc / 下流service / browser harnessの実装、Docker restart設定の調査・修正、
  Gate 4の再実行、過去artifactの書き換え。

## 実装方針

`documents/migration/pion/validation-plan.md` を検証範囲の正本、
`documents/migration/pion/implementation-phases.md` をphase出口の正本、
`documents/migration/pion/phase-4-cutover-runbook.md` を実行手順の正本として同期する。
`task-260802033044-pion-phase-3-production-candidate-gate-3` と
`task-260809020145-pion-phase-4-cutover-rehearsal` は履歴と現行条件の差分を確認する対象とする。

## テスト

- Gate 4 taskと3つの移行文書を相互参照し、必須条件とrunbookが一致することを確認する。
- `npm run tasks:check` とMarkdown link確認を実行する。

## ドキュメント同期の要否

要。上記3文書と現行Gate 4 taskを同期する。通信契約・runtimeの公開挙動は変更しない。
