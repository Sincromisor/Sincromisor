# AGENTS.md

このファイルは、LLM エージェントが **Sincromisor** を短時間で理解し、安全に変更するための初動ガイドである。
詳細なルールや設計情報は各正本文書を参照する。

## プロジェクト概要

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するためのサービス基盤である。

- サーバー: `sincromisor-server`（Python）
    - WebRTC シグナリング、音声抽出、音声認識、テキスト処理、音声合成を分離した構成。
    - サービス発見には Consul を使う。
- クライアント: `sincromisor-frontend`（TypeScript + Vite）
    - Vite MPA + React app shell + Three.js / VRM 1.0 で画面とキャラクターを描画する。
    - `simple-vrm`、`vrm360`、`looking-glass-vrm` などのページを持つ。
- 設計文書: `documents/design/`
    - 入口: `documents/design/index.md`
    - 運用ガイド: `documents/design/documentation-guide.md`
- 使用言語
    - 開発者は日本語ネイティブであるため、原則として日本語を用いる。
    - 技術用語など、日本語では表現が不自然になるものについては、適宜英語を用いても構わない。

## 最初に読む

作業対象が未確定なら、次の順に読む。

1. `README.md`
2. `compose.yml`
3. `examples/compose.env`
4. `documents/design/index.md`
5. `documents/design/architecture/overview.md`
6. `tasks/README.md`

対象別の正本は次を優先する。

- WebRTC 契約: `documents/design/contracts/frontend-rtc.md`
- フロント UI / app shell: `documents/design/frontend/app-shell.md`
- フロントページ構成: `documents/design/frontend/pages.md`
- バックエンドサービス: `documents/design/backend/services/`
- compose / Consul / storage: `documents/design/infrastructure/`
- タスク管理: `tasks/README.md`
- コード構造ルール: `documents/rules/code-structure.md`
- Python 規約: `documents/rules/coding-py.md`
- TypeScript 規約: `documents/rules/coding-ts.md`
- Markdown 規約: `documents/rules/coding-md.md`

## ディレクトリマップ

- `sincromisor-server/`
    - `sincro-rtc/`: WebRTC シグナリングサーバー。
    - `speech-extractor/`: 音声区間抽出。
    - `speech-recognizer/`, `speech-recognizer-nemo/`: 音声認識。
    - `text-processor/`: チャット応答生成。
    - `voice-synthesizer/`: 音声合成。
    - `sincro-config/`, `sincro-models/`: 設定ロード、サービス発見、サービス間モデル。
- `sincromisor-frontend/src/`
    - `app/`: app controller、shell、settings、event / bridge。
    - `features/`: RTC、media、conversation、dialog、debug、settings、gaze などの機能単位。
    - `character/`: VRM scene、behavior、retargeting、IK、Looking Glass / VRM360 runtime。
    - `pages/`: Vite MPA の HTML / entry / page-specific React panel。
    - `shared/`: logging と横断型。
    - `ts/`, `react/`: 旧構成。新規実装は原則置かない。
- `documents/design/`: 現在有効な設計、契約、ADR、initiative。
- `documents/rules/`: コーディング、構造、文書運用の横断ルール。
- `tasks/`: 作業タスク、検証ログ、subagent 成果物。
- `documents/tasks/`: 旧タスク管理からの移行案内。

## 作業原則

- 趣味プロダクトとして、現状で最良のものを作る。後方互換性より負債を残さないことを優先する。
- 既存の通信契約（endpoint / JSON / DataChannel / msgpack）を変更する場合は、破壊的変更として明示し、フロントとサーバーを同時に確認する。
- compose、設定、実装、設計文書を片側だけ更新しない。
- 再現手順と確認結果はタスク文書に残す。
- ソースコードのコメントは、公開 API、境界、非自明な判断、制約理由を中心に、積極的に記述する。
- コメント方針は Google の TypeScript / Python style guide を基準にし、他者が素早く文脈を理解できる内容にする。
- 設計変更を伴う実装変更では、`documents/design/` の該当文書と `documents/design/index.md` の導線を確認する。

## 変更時の確認先

- WebRTC 接続仕様を変える場合
    - サーバー: `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
    - フロント: `sincromisor-frontend/src/features/rtc/rtcTalkClient.ts`
    - 契約正本: `documents/design/contracts/frontend-rtc.md`
- UI / 3D 表示を変える場合
    - `sincromisor-frontend/src/pages/**`
    - `sincromisor-frontend/src/app/**`
    - `sincromisor-frontend/src/features/**`
    - `sincromisor-frontend/src/character/**`
    - 設計正本: `documents/design/frontend/`
- 設定を追加する場合
    - `.env` サンプル: `examples/compose.env`
    - compose environment: `compose/` と `compose.yml`
    - Python 側の引数・設定クラス: `sincro-config` など
    - インフラ正本: `documents/design/infrastructure/compose.md`

## タスクとコミット

- タスクは `tasks/<category>/task-<id>-<slug>/` に作る。
- 状態は物理ディレクトリではなく `meta.yaml` の `status` を正本にする。
- review / implementation log / evaluation は `review.md`, `impl.md`, `eval.md` に分離する。
- 標準入口は `.claude/commands/` の `new-task`, `review-task`, `next-task`, `run-task` とする。Codex 用の `.agents/skills/` と `.codex/agents/` は `npm run gen:codex` で生成する。
- `/run-task` は review freshness check、implementation worktree、independent evaluation worktree、`tasks:close`、`tasks:reindex` を調停する。実装ブランチは `package.json` の `taskBranchPrefix` を正本にし、既定は `codex/<task-id>` とする。
- upstream workflow との差分は `.agents/CUSTOMIZATIONS.md` に記録する。
- 最低限、タスク単位でコミットする。コミットメッセージは Conventional Commits ベースで書き、body には変更理由、主な変更、確認結果、残リスクを、footer には関連 task ID または legacy `TASK-...` ID の `Refs:` を含める。
- 詳細は `tasks/README.md` を正本とする。

## 通信フロー概要

1. フロントが `GET /api/v1/RTCSignalingServer/config.json` で接続設定を取得する。
2. フロントが `POST /api/v1/RTCSignalingServer/offer` で Offer を送る。
3. フロントが `POST /api/v1/RTCSignalingServer/candidate` で ICE candidate を送る。
4. サーバーが Answer を返し、PeerConnection を確立する。
5. DataChannel の `text_ch` と `telop_ch` でチャット、テロップ、口形同期情報を受ける。

詳細は `documents/design/contracts/frontend-rtc.md` を正本とする。

## ローカル確認

変更内容に応じてフロント、Python、Compose、Markdown、task tooling の確認範囲を選ぶ。具体的なコマンドと task close 前の必須確認は `tasks/README.md` を正本とする。実行できなかった確認は、理由をタスク文書と最終報告に残す。

## よくある落とし穴

- フロントのマイク / カメラ権限がないと接続処理や CharacterGaze が途中で止まる。
- `offerURL`、`candidateURL`、ICE server 設定の不一致で WebRTC ネゴシエーションに失敗する。
- 新しい環境変数を compose、設定クラス、サンプル env の片側だけに追加してしまう。
- `@mediapipe/tasks-vision` の wasm 配置漏れで tracking 系機能が動作しない。
