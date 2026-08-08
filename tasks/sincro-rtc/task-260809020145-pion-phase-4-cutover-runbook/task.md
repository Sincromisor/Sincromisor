# Pion停止切替とrollbackのrunbookを確定する

## 背景 / 目的

移行文書には方針があるが、運用者がそのまま実行できるcompose command、確認点、所要時間の記録欄がない。
Phase 4リハーサルで使う短いrunbookを、実装済みcompose構成に合わせて確定する。

## 完了条件（受け入れ条件）

- [ ] aiortcの新規受付停止と既存session終了、Pion起動、readiness確認、smoke test、Pionの最大6秒の終了待ち、
      aiortc復旧の順に、実行commandと成功判定が記載されている。
- [ ] 固定UDP port、public IPv4、NAT forward、firewall inbound、対象interfaceを切替前に確認できる。
- [ ] Pion process crash後のrestart/readiness確認と、必要最小限のmetrics/log保存手順が記載されている。
- [ ] rollbackはFrontendと下流serviceをrebuildせず、接続中sessionは失われることを明記する。
- [ ] 各段階の開始・終了時刻、結果、未観測事項を後続taskの`artifacts/gate-4-result.md`へ記録できる。

## 設計判断

- 新しい運用CLIは作らず、後続taskがcompose commandを順に実行するMarkdown runbookとする。
- 詳細な比較表や障害注入手順は作らない。rollback条件は既存の重大障害だけを参照する。

## スコープ境界

- 本タスク: Phase 4 runbookと結果テンプレート。
- 依存: 排他的compose構成。
- スコープ外: 実環境でのcommand実行、Gate 4判定、Phase 5の切替日時決定。

## 実装方針

`documents/migration/pion/rollout-and-operations.md`を正本とし、実行手順を同文書または直接リンクされた
1ファイルへ追加する。compose commandは`docker compose config`で存在を確認する。

## テスト

- runbook記載のread-only/config commandを実行し、service/profile名とenv名が現行composeに一致することを確認する。
- `npm run tasks:fixlinks`と`npm run gate`。

## ドキュメント同期の要否

本タスク自体が文書同期である。設計の現在状態は変えない。
