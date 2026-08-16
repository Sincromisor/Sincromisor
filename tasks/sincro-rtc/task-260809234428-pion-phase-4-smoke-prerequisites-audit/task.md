# Phase 4実環境smokeの前提を監査する

## 背景 / 目的

Gate 4を複数回実行しても、Gate 3向けのmock固定文を要求するbrowser testでは、VPS VPN越しの
実下流serviceによる1 turn（利用者/応答text、telop、非無音音声）を判定できなかった。

次の切替リハーサル前に、実環境smokeの入力・観測・復旧の前提を一度に洗い出す。個別症状への
場当たり的な修正はせず、確認済み・阻害要因・修正責務を決定的に記録する。

## 完了条件（受け入れ条件）

- [ ] `artifacts/phase-4-smoke-prerequisites.md` に、次の各経路について供給元、消費先、
      観測方法、結果（ready / blocked / fix required）、対象layer、根拠artifact、再現command、
      相関時刻、責任パスを記録する。
    - Chrome / Firefox、HTTPS origin、マイク入力、ICE / DataChannel / audio出力のbrowser経路
    - speech extractor、recognizer、text processor、voice synthesizerの実下流4 service経路
    - Consul catalog、VPS VPN、Pion / aiortc image・commit・Compose profile・public TCP/UDP経路
    - session収束、aiortc rollbackと最終復旧
- [ ] Docker Engine / Compose version、実効Compose、image digest、Frontend配布assetのcommit、
      Compose project / profile、Consul service health / address、外部UDP到達性、browser version / flags /
      fake audioを同じ実行時刻基準で照合する。
- [ ] 既存 Gate 3 browser testの固定文・mock依存を明記し、production相当の1 turnを判定できる
      既存手順、または不足している観測点を一意に特定する。
- [ ] Chrome / Firefoxそれぞれの実行方法と、可変なproduction応答を1 turn合格と判定するoracleの
      採用判断を `artifacts/phase-4-smoke-prerequisites.md` のdecision recordへ記録する。方式が未決なら
      実装taskを起票しない。
- [ ] `fix required` は根本原因ごとに1つだけ、原因、再現手順、修正所有者、受け入れ条件を持つ
      後続taskへ起票する。方式選択が必要な項目はdecision taskにする。
- [ ] VPSのprivate artifactに、時刻・対象commit・sanitizedなhealth/status/metrics/logを保存し、
      最終状態をPion healthy・active session 0へ戻す。
- [ ] `npm run gate` が成功する。

## 設計判断

このタスクは監査と後続task起票だけを行い、production経路のコード・compose・設定を変更しない。
実下流serviceの内容を固定のmock文で置き換えず、観測方法が不足している場合はその不足自体を
blockerとして扱う。会話、音声、SDP、candidate、session IDは公開artifactへ保存しない。

## スコープ境界

- 本タスク: Gate 4前提のend-to-end監査、private evidence、公開要約、必要な後続taskの起票。
- スコープ外: browser harness、下流service、Pion / aiortc、Docker設定の実装修正、Gate 4再実行。
- Pion process crash後のrestartは移行Gateの必須条件から外す。実運用の可用性要件として必要になった場合は、
  aiortcとの同等性と運用責務を確定した独立taskで扱う。

## 実装方針

`work/vps.md`、既存のPhase 4 runbook、Gate 4 artifact、Gate 3 browser test、Compose設定、
Consul / health / metricsを読み、VPSでread-only中心の確認を行う。既知のrestart不良は
移行Gateの対象外として、この監査ではSIGKILLしない。共有serviceを停止する確認はmaintenance / 排他確認後に限り、
各段階の証拠を先に保存して期限内にPionをhealthyへ復旧する。公開artifactはsanitizedな結果と
private evidenceの相対参照だけを記録する。

## テスト

- artifactの全監査項目が状態・根拠・次の責務を持つことを確認する。
- private evidenceの時刻、対象commit、公開要約を照合する。
- `npm run gate` を実行する。

## ドキュメント同期の要否

要。監査結果は `artifacts/` を正本とし、Gate 4再実行の前提または移行判断を変える場合だけ
`documents/migration/pion/roadmap.md` とrunbookへ要約を同期する。通信契約は変更しない。
