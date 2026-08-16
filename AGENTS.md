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
    - 技術用語など、日本語では表現が不自然になるものについてのみ、英語を用いても構わない。

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
- Go 規約: `documents/rules/coding-go.md`
- Markdown 規約: `documents/rules/coding-md.md`
- ソースコードコメント品質: `documents/rules/source-comments.md`

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

- 「個人開発の趣味プロダクト」として、その時点で最良の構成で作る。後方互換性より負債を残さないことを優先する。
    - 個人の限定されたリソースでの開発であるため、「どの環境でも完璧に動作すること」、「高度な機能を提供すること」、「高い性能を出すこと」、「適切な評価をすること」は求めず、「まずは動作すること」を優先する。
- 通常変更は、最小の実装、変更範囲に対応する確認、1コミットで完了させる。専用worktree、独立レビュー・評価、全体gateは、明示要求または失敗コストが高い変更に限定する。
- 必須要件は、ユーザー要求、既存の公開契約、再現済み不具合、セキュリティ・データ損失防止、実行に不可欠な制約のいずれかを根拠とする。根拠のない性能値、網羅試験、複数環境対応を完了条件にしない。
- 変更前からある不整合や変更範囲外の検査失敗は、今回の変更が悪化させない限り警告として報告し、作業を止めない。変更した文書の整形など安全に一意に直せるものは自動修正する。
- 既存の通信契約（endpoint / JSON / DataChannel / msgpack）を変更する場合は、破壊的変更として明示し、フロントとサーバーを同時に確認する。
- compose、設定、実装、設計文書を片側だけ更新しない。
- 再現手順と確認結果はタスク文書に残す。
- ソースコード内のコメントには、**安全な変更を可能にすること**と、**調査時の理解時間を短縮すること**の 2 つの独立した目的がある。
    - public API、境界、非自明な制約へのコメントは必須の下限であり、それだけ満たせば十分という意味ではない。
    - exported / public な関数・class・type・component・hook・module には、原則として各言語の標準 doc comment（TypeScript の JSDoc/TSDoc、Go の doc comment など）を書く。
    - 契約、制約、失敗条件、副作用、非自明な判断理由を、未来の保守者が安全に変更できる形で残す。
    - 処理の全体像、段階、状態遷移、データ表現、離れたコード間の関係を、一般的な開発者が短時間で把握できる形で残す。
    - 禁止するのは、コードを同じ粒度で一行ずつ読み上げる逐語説明である。複数行の処理を一段高い抽象度で要約するコメントや、pipeline 内の位置を示すコメントは積極的に書く。
    - 既存コードにコメントがないことは、新規・変更コードでコメントを省略する理由にならない。既存実装より現行規約を優先する。
    - 既存コードを変更する場合は、変更箇所と、その変更を理解するために読む直接の helper、state、event、lifecycle、データ変換まで確認する。
    - 本番コードを変更した場合は、変更したシンボル・処理群・判断と上記の直接範囲を全件点検する。必須コメントの欠落・説明不足・stale comment は完了を妨げる不適合とし、監査台帳を作らなくても解消してから完了する。
    - 「趣味開発」「既存コードにない」「短い」「内部用」「型や命名で分かる」は、必須対象のコメントを省略する理由として認めない。
    - stale comment を作らない。コード変更時は関連コメントを更新または削除する。
    - TODO は単に「あとで直す」と書かず、理由、削除条件、issue番号、期限または判断基準を含める。
    - コメント追加前に命名・関数分割・型定義・引数オブジェクト化を検討するが、構造改善だけを理由に reader-oriented な説明を省略しない。
    - 横断的な詳細基準は `documents/rules/source-comments.md`、記法と言語固有の対象は `documents/rules/coding-*.md` を参照する。
- 設計変更を伴う実装変更では、`documents/design/` の該当文書と `documents/design/index.md` の導線を確認する。

### 良いコメントの例

取得対象、除外理由、下流処理との契約、例外条件を説明している。
また、不必要に英語混じりにしていない。

```ts
/*
    現在のテナントから参照可能なアクティブユーザーを取得する。

    論理削除されたユーザーは除外される。
    (後続の権限チェックにおいて、取得されたすべてのユーザーは
     追加のステータス確認なしに表示可能であると前提されているため。)

    @throws AuthError セッションにテナントの紐付けがない場合。
*/
export async function fetchVisibleUsers(session: Session): Promise<User[]> {
  ...
}
```

単なる分岐説明ではなく、センサー欠損時の設計意図と視覚品質上の理由を記録している。

```ts
/*
    手の動きが速い場合、MediaPipeのランドマークが一時的に消失することがある。
    デフォルトのポーズに急激に切り替わる（スナップする）様子が見えないよう、
    短い猶予期間中は手首の回転情報を保持する。
*/
if (!landmarks.wrist && wristHoldFrames < MAX_WRIST_HOLD_FRAMES) {
  ...
}
```

複数の処理段階における現在位置と、後段へ委ねる責務を説明している。

```ts
/*
    MediaPipe座標をVRMのlocal座標へ正規化する。
    smoothingとIK補正は後段で行うため、ここでは座標系の変換だけを完了させる。
*/
```

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
- `review.md` と `eval.md` は独立レビュー・評価を実行した場合だけ記録する。`impl.md` は設計判断、逸脱、未実行確認、残リスクがある場合だけ簡潔に使う。
- 標準入口は `.claude/commands/` の `new-task`, `run-task` とする。次タスクの抽出は `npm run tasks:next` を直接使う。Codex 用の `.agents/skills/` と `.codex/agents/` は `npm run gen:codex` で生成する。
- `/run-task` は変更リスクに応じて通常・統合・高リスクの経路を選ぶ。通常変更は現在のworktreeで親Codexが直接実装し、対象確認とタスク状態・索引を同じコミットに含める。専用worktree、実装担当、独立レビュー・評価、`tasks:close` は統合変更で必要な場合または高リスク変更だけに使う。
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

変更内容に応じてフロント、Python、Go、Compose、Markdown、task tooling の確認範囲を選ぶ。具体的なコマンドと task close 前の必須確認は `tasks/README.md` を正本とする。実行できなかった確認は、理由をタスク文書と最終報告に残す。

## よくある落とし穴

- フロントのマイク / カメラ権限がないと接続処理や CharacterGaze が途中で止まる。
- `offerURL`、`candidateURL`、ICE server 設定の不一致で WebRTC ネゴシエーションに失敗する。
- 新しい環境変数を compose、設定クラス、サンプル env の片側だけに追加してしまう。
- `@mediapipe/tasks-vision` の wasm 配置漏れで tracking 系機能が動作しない。
