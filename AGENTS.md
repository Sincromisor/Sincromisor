# AGENTS.md

このファイルは、LLMエージェントが **Sincromisor** を短時間で理解し、安全に変更するための作業ガイドです。

## 1. プロジェクト概要

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するためのサービス基盤です。

- サーバー: `sincromisor-server`（Python）
  - WebRTC シグナリング
  - 音声抽出 / 音声認識 / テキスト処理 / 音声合成
  - サービス発見（Consul）を利用した疎結合構成
- クライアント: `sincromisor-frontend`（TypeScript + Vite）
  - WebRTC 接続
  - `three` / `@pixiv/three-vrm` による 3D キャラクター描画
  - マルチページ構成（simple-vrm, glass, vrm360 など）

## 2. 最初に読むファイル（推奨順）

1. `README.md`
2. `compose.yml`
3. `examples/compose.env`
4. `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
5. `sincromisor-frontend/vite.config.js`
6. `sincromisor-frontend/src/ts/SincroController.ts`
7. `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`

## 3. ディレクトリマップ

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

## 4. 通信フロー（実装把握用）

1. フロントが設定取得
   - `GET /api/v1/RTCSignalingServer/config.json`
2. フロントが WebRTC Offer を送信
   - `POST /api/v1/RTCSignalingServer/offer`
3. サーバーが Answer を返し、PeerConnection を確立
4. DataChannel でメッセージ受信
   - `text_ch`: テキスト（チャット）
   - `telop_ch`: テロップ情報

フロント側の主制御は `SincroController`、WebRTC 接続処理は `RTCTalkClient` が担当します。

## 5. ローカルセットアップ（開発時）

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

## 6. 変更時の指針（LLM 向け）

- WebRTC 接続仕様を変える場合
  - サーバー: `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
  - フロント: `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - 両側の payload / endpoint 整合を必ず確認
- UI・3D 表示を変える場合
  - エントリ HTML と `src/ts/SincroVRM/**` をセットで確認
  - モード別ページ（`simple-vrm`, `vrm360`, `glass` など）の差分に注意
- 設定追加時
  - `.env` 変数定義（`examples/compose.env`）
  - compose の environment
  - Python 側の引数・設定クラス（`sincro-config`）

## 7. よくある落とし穴

- フロントのマイク/カメラ権限がないと接続処理が途中で止まる
- `offerURL` や ICE サーバー設定不一致で WebRTC ネゴシエーションに失敗
- 新しい環境変数を追加しても compose / 設定クラスの片側だけ更新してしまう
- `@mediapipe/tasks-vision` の wasm 配置漏れで CharacterGaze が動作しない

## 8. 変更後の最低確認

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

## 9. 作業優先順位（迷ったとき）

1. 既存の通信契約（endpoint / JSON）を壊さない
2. フロントとサーバーの変更を片側だけで終わらせない
3. compose + 設定 + 実装の 3 点を整合させる
4. 変更点を最小に保ち、再現手順と確認結果を残す
