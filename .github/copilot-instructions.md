# Sincromisor プロジェクトについて

Sincromisorは、オンプレミス環境でAIエージェントとの音声対話を実現するプロジェクトです。

## プロジェクト構成

- **sincromisor-server**: サーバーサイドのコード（Python + uv + ruff）
- **sincromisor-client**: クライアントサイドのコード（Vite + プレーンTypeScript）
- **Docker**: Docker Compose関連のコード

## 技術スタック

### サーバーサイド
- Python
- uv (依存関係管理)
- ruff (リンター/フォーマッター)
- FastAPI + uvicorn (Appサーバー)
- pydantic (型定義)

### クライアントサイド
- Vite
- TypeScript (フレームワークなし)
  - Three.js (キャラクター・背景の描画)
    - pixiv/three-vrm (キャラクターモデル: VRM-1.0)
  - mediapipe/tasks-vision (顔認識)

### デプロイメント
- Docker Compose

### サーバー - クライアント間の通信
- WebRTC (ブラウザ - RTCサーバー間)
- WebSocket (RTCサーバー - サービスサーバー間)
- HTTP (ブラウザ - コンテンツサーバー、RTCサーバー間)

## コーディングガイドライン

### Python (サーバー)
- PEP 8準拠のコードを書く
- ruffを使用してコードをフォーマット
- 型ヒントを積極的に使用する
- 非同期処理には`async`/`await`パターンを使用する
- ログ記録には標準的なPythonの`logging`モジュールを使用する

### TypeScript (クライアント)
- フレームワークを使用せず、プレーンなTypeScriptで実装
- 型安全なコードを書く
- モジュール化されたコードを書く
- ES2020の機能を活用する

### Docker
- コンテナは軽量に保つ
- マルチステージビルドを使用する
- 適切な環境変数を使用する

## 主な機能

- AIエージェントとのリアルタイム音声対話
- 音声認識と音声合成
- オンプレミス環境での動作
- ブラウザベースのインターフェース

コードを生成する際は、これらの技術スタックと設計原則に従ってください。また、コードはパフォーマンス、セキュリティ、保守性を考慮したものであるべきです。
