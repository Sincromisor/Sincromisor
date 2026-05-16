# TASK-260517011929 設計ドキュメント再編

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High

## 目的

`documents/design` の旧フラット構成を、現在設計・契約仕様・判断記録・進行中計画・履歴参照へ分離し、LLM エージェントと開発者が目的別に読む文書を選べる状態にする。

## 背景

- 旧構成は `frontend_ui.md`、`backend_sincro_rtc.md`、`networking_rtc.md` のようなファイル名ベースの一覧だった。
- 一部文書では現在設計、移行計画、作業ログ、検証結果が混在し、変更時に読む範囲が広くなっていた。
- 前段タスクで `documentation-guide.md` とテンプレートを追加したため、その方針に沿って再編する。

## スコープ

- `architecture/`, `frontend/`, `backend/services/`, `contracts/`, `infrastructure/`, `decisions/`, `initiatives/` の追加
- 旧フラット文書の `archive/legacy-flat/` 退避
- `documents/design/index.md` の目的別導線更新
- `AGENTS.md` の推奨導線更新

## 非対象

- 実装コードの変更
- endpoint / payload / msgpack model の仕様変更
- 旧 task done 内の履歴参照の一括置換

## 対応内容

- 全体構造と runtime flow を `architecture/` に分離した。
- WebRTC / Audio pipeline / 固有名詞辞書を `contracts/` に分離した。
- frontend の app shell、pages、settings/debug、VAD、character overview/motion/tracking を `frontend/` に分離した。
- backend service の現在設計を `backend/services/` に分離した。
- compose、Consul、storage を `infrastructure/` に分離した。
- React 移行、Overlay frame、固有名詞補強の判断を ADR として `decisions/` に分離した。
- React 移行と固有名詞補強の継続観点を `initiatives/` に分離した。
- 旧文書を `archive/legacy-flat/` へ退避した。

## 確認

- [x] `documents/design/index.md` から新しい正本文書へ辿れる。
- [x] 旧文書は archive で履歴参照できる。
- [x] `AGENTS.md` の最初に読むファイルと設計ディレクトリ説明が新構成に合っている。
- [x] Markdown 差分に trailing whitespace 等がない。

## 実施メモ

- 完了済み task done に含まれる旧パス参照は履歴として残した。
- open task の旧パス参照は、次に該当タスクを再開する際に新パスへ更新する。
- `DESIGN.md` は作業前から未追跡で存在しており、本タスクでは触っていない。
