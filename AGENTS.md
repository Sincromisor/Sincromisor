# AGENTS.md

このファイルは、LLMエージェントが **Sincromisor** を短時間で理解し、安全に変更するための作業ガイドです。

## プロジェクト概要

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するためのサービス基盤です。

- サーバー: `sincromisor-server`（Python）
    - WebRTC シグナリング
    - 音声抽出 / 音声認識 / テキスト処理 / 音声合成
    - サービス発見（Consul）を利用した疎結合構成
- クライアント: `sincromisor-frontend`（TypeScript + Vite）
    - WebRTC 接続
    - `three` / `@pixiv/three-vrm` による 3D キャラクター描画
    - マルチページ構成（simple-vrm, looking-glass-vrm, vrm360 など）
- 設計文書: `documents/design/`（本プロジェクトの設計情報の正本）
    - 入口: `documents/design/index.md`
    - テンプレート: `documents/design/template.md`

## 作業を行う際の心構え

- これは**趣味プロダクト**であり、現状で最良のものを作ることが目標
    - 後方互換性の考慮はほとんどの場合で不要
    - 技術的負債を残さないことを常に心がける
    - 最小変更にこだわらず、変えるべき時は変える
- 既存の通信契約（endpoint / JSON）を変更する際は、明示して指示を仰ぐ(再デプロイが必要な場面を明確にする)
- フロントとサーバーの変更を片側だけで終わらせない
- compose + 設定 + 実装の 3 点を整合させる
- 再現手順と確認結果を残す

## コメントの記述とドキュメントの更新

- ソースコードには積極的にコメントを記述する
- コメントは、Googleのスタイルガイドラインを熟読して確実に記述し、他社が素早くコンテキストを理解できる内容とすることを心掛ける
    - <https://google.github.io/styleguide/tsguide.html#comments-documentation>
    - <https://google.github.io/styleguide/pyguide.html#38-comments-and-docstrings>
- ソースコードを変更した際など、documents/design以下の設計ドキュメントの更新が必要な場合はその旨を通知し、更新を促す
- スタイルガイドラインに則っていない不適切なコードは、レビュワーから差し戻される

## コーディング規約 (TypeScript)

型運用 / エラー / ログ / テスト / import / null / 日付 / TODO / env / 言語ポリシーなどの横断ルールは [documents/rules/coding-ts.md](documents/rules/coding-ts.md) を正本とする。
本書ではディレクトリ・命名・サイズなど物理構造に関する原則のみ保持する。

- 設計思想: (1) 負債が残りにくい方向を選ぶ (2) debug と更新のしやすさを維持する
- ルールは原則 hard。**破る場合は同じ行に `// reason: <理由>` を付ける**(レビューでの差し戻し基準は理由の有無)
- コミット前は `npm run build` を必ず通す。`npm run check`(Biome lint+format / Prettier md) と `npm run test` は scripts 導入後に必須化する

### 命名規約(TypeScript)

| 対象                          | 規約                                         |
| ----------------------------- | -------------------------------------------- |
| `.ts` ファイル / ディレクトリ | camelCase(`configStore.ts` / `configStore/`) |
| クラス / Zod schema           | PascalCase(`ConfigStore`)                    |
| 関数 / 変数                   | camelCase                                    |
| 定数                          | UPPER_SNAKE                                  |
| `.md` ファイル(ドキュメント)  | kebab-case                                   |

kebab-case や snake_case のファイル名は使わない(`config-store.ts` / `config_store.ts` 不可)。

## タスク管理とコミットのルール

- タスクは`documents/tasks/<大分類>/open/TASK-<タスクID>-<タスク概要>.md`に記述する
- 最低限のラインとして、タスク単位でコミットを行う
    - 1タスク内でも必要に応じてコミットを行い、差分が巨大にならないようにする
    - コミットは自律的に行ってもよい
- コミット時は、関連するタスクIDを明記する
- タスクIDは、%y%m%d%H%M%Sとする
    - 例: 2026年4月1日 23:59:00秒に起票したタスクは"260401235900"
- タスクが完了したら、タスクファイルを`done`に移動する
- コミットメッセージは、何をどのような意図で行ったのかが明確になるように記述する

## ファイル・関数サイズと分割のルール

読み流せない長さのファイル / 関数はバグ温床。下記閾値を守る。

### サイズ閾値

| 区分                | ソフト | ハード | 備考                                                                                 |
| ------------------- | ------ | ------ | ------------------------------------------------------------------------------------ |
| **ファイル**        | 200 行 | 300 行 | import / コメント / 空行を除く。超過時は分割を**検討**(ソフト)/ **原則実施**(ハード) |
| **関数 / メソッド** | 40 行  | 60 行  | 中括弧と return 文を除く。超過時は private 関数 / 別モジュールへ抽出                 |
| **関数の引数数**    | 3 個   | 4 個   | 超えるなら options オブジェクトに集約                                                |
| **ネスト深さ**      | 3 段   | 4 段   | 早期 return / ガード節 / 関数抽出で平坦化                                            |

「UI 更新 / 外部 I/O / 純粋計算」が同一ファイル・同一関数に混在し始めたら、行数に関わらず分割する。

### 基本原則

- **1 ファイル = 1 主要 export**(controller / service / manager / component / schema 群 のいずれか)
- `index.ts` は **barrel 専用**。実装ロジックを書かない
- 補助関数 / 内部型はファイル内 private に留め、2 箇所目で利用された時点で別ファイルに抽出(Rule of Three の手前で動く)
- **テスト都合だけの export 公開禁止** — 必要 = 独立モジュール化のサイン
- **「将来のために」分割しない** — 必要になってから変える
- **コメントで段落分けしたくなったら関数抽出のサイン**(`// ---- Step 1: 〜 ----` 等)

### アンチパターン(明示禁止)

| パターン                                             | 代わりに                                  |
| ---------------------------------------------------- | ----------------------------------------- |
| `utils.ts` / `helpers.ts` / `common.ts`              | 責務名で命名(`ids.ts` / `errors.ts` 等)   |
| `index.ts` に実装を書く                              | barrel 専用、実装は別ファイル + re-export |
| 1 ファイルに複数 controller / service / manager 定義 | 1 ファイル 1 主役                         |
| 100 行超の単一関数                                   | 段階的に private 関数へ抽出               |
| テスト用に内部関数を `export`                        | 別ファイルへ抽出                          |

## 最初に読むファイル（推奨順）

1. `README.md`
2. `compose.yml`
3. `examples/compose.env`
4. `documents/design/index.md`
5. `documents/design/template.md`
6. `documents/tasks/README.md`
7. `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
8. `sincromisor-frontend/vite.config.js`
9. `sincromisor-frontend/src/ts/SincroController.ts`
10. `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`

## ディレクトリマップ

- `sincromisor-server/`
    - `sincro-rtc/`: WebRTC シグナリングサーバー（FastAPI + uvicorn）
    - `speech-extractor/`: 音声区間抽出
    - `speech-recognizer/`, `speech-recognizer-nemo/`: 音声認識
    - `text-processor/`: チャット応答生成（Dify 連携あり）
    - `voice-synthesizer/`: 音声合成
    - `sincro-config/`: 設定ロード・サービス発見共通処理
    - `sincro-models/`: サービス間データモデル
- `sincromisor-frontend/`
    - `src/ts/RTC/`: WebRTC 接続ロジック
    - `src/ts/SincroVRM/`: VRM 1.0 キャラクター描画
    - `src/ts/UI/`: チャットやデバッグ UI
    - `src/*.html`, `src/**/index.html`: 画面エントリ
    - `public/characters/default.vrm`: デフォルトキャラクター
- `compose/`
    - 各マイクロサービスの compose 定義
- `Docker/`
    - 各コンテナの Dockerfile と起動スクリプト
- `documents/design/`
    - `index.md`: 設計文書の入口
    - `frontend_*.md`: フロントエンド設計
    - `backend_*.md`: バックエンド設計
    - `networking_*.md`: 通信契約設計
    - `service_*.md`: compose / Consul 設計
    - `template.md`: 設計文書テンプレート
- `documents/tasks`

## 通信フロー（実装把握用）

1. フロントが設定取得
    - `GET /api/v1/RTCSignalingServer/config.json`
2. フロントが WebRTC Offer を送信
    - `POST /api/v1/RTCSignalingServer/offer`
3. サーバーが Answer を返し、PeerConnection を確立
4. DataChannel でメッセージ受信
    - `text_ch`: テキスト（チャット）
    - `telop_ch`: テロップ情報

フロント側の主制御は `SincroController`、WebRTC 接続処理は `RTCTalkClient` が担当します。

## ローカルセットアップ（開発時）

### Server (Python)

```sh
./utils/setup/server.sh
```

- `uv sync --group full` を実行
- 依存パッケージはルート `pyproject.toml` の workspace 設定で解決

### Frontend (TypeScript)

```sh
./utils/setup/frontend.sh
```

- `npm install`
- MediaPipe wasm を `public/mediapipe-wasm` に配置
- `npm run build`

### Frontend 単体起動

```sh
cd sincromisor-frontend
npm run dev
```

### Compose 起動

```sh
cp examples/compose.env .env
chmod 600 .env
docker compose --profile full up -d
```

## 変更時の指針（LLM 向け）

- WebRTC 接続仕様を変える場合
    - サーバー: `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
    - フロント: `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
    - 両側の payload / endpoint 整合を必ず確認
- UI・3D 表示を変える場合
    - エントリ HTML と `src/ts/SincroVRM/**` をセットで確認
    - モード別ページ（`simple-vrm`, `vrm360`, `looking-glass-vrm` など）の差分に注意
- 設定追加時
    - `.env` 変数定義（`examples/compose.env`）
    - compose の environment
    - Python 側の引数・設定クラス（`sincro-config`）
- 設計変更を伴う実装変更時
    - `documents/design/` の該当文書を同時更新
    - 入口の `documents/design/index.md` との整合を確認

## よくある落とし穴

- フロントのマイク/カメラ権限がないと接続処理が途中で止まる
- `offerURL` や ICE サーバー設定不一致で WebRTC ネゴシエーションに失敗
- 新しい環境変数を追加しても compose / 設定クラスの片側だけ更新してしまう
- `@mediapipe/tasks-vision` の wasm 配置漏れで CharacterGaze が動作しない

## 変更後の最低確認

- フロントビルド

    ```sh
    cd sincromisor-frontend && npm run build
    ```

- Python 静的チェック（必要に応じて）

    ```sh
    uv run ruff check .
    ```

- 起動確認
    - `docker compose --profile full up -d`
    - フロント画面遷移
    - 音声入出力 + テキスト/テロップ受信
