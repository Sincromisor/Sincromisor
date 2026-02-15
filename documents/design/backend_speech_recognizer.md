# Backend Speech Recognizer 設計

Sincromisor の Speech Recognizer サービス（音声認識）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_speech_recognizer.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - Extractor結果の音声区間をテキスト化し、逐次結果を下流に送る
- 対象範囲:
  - `SpeechRecognizerProcess.py`（nue実装）
  - `SpeechRecognizerNemoProcess.py`（nemo実装）
  - 共通API契約 `/api/v1/SpeechRecognizer/recognize`
- 非対象範囲:
  - 音声抽出・テキスト応答生成・音声合成
- LLM向け要約（3-5行）:
  - Speech Recognizer は `SpeechExtractorResult` を受信し、`SpeechRecognizerResult` を返すWSサービス。
  - 同じ `speech_id` の断片を連結しながら逐次認識する。
  - 実装は `nemo` と `nue` の2系統があり、compose環境変数で切替える。
  - `confirmed=True` 時にはローカル/S3へ認識結果・音声ログを保存できる。

## 3. 背景

- 解決したい課題:
  - 発話中の部分結果と発話完了時の確定結果を同一契約で提供する
- 現状の問題点:
  - モデル実装が複数あり、運用時に挙動差分が出る
- 採用理由:
  - モデルを差し替え可能な共通WebSocket契約にしている
- 制約条件:
  - 16kHz mono前提
  - GPU依存（特にNue-ASR）

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| partial | `confirmed=False` の途中認識結果 |
| confirmed | 発話終端時の確定認識結果 |
| S3 export | 認識結果JSONと音声ファイルの保存機能 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - WebSocket `/recognize` で `SpeechExtractorResult` を受信できること
  - `speech_id` ごとのバッファ連結により認識できること
  - `SpeechRecognizerResult` を逐次返却できること
  - confirmed時にログ出力（ローカル/S3）できること
- 優先度（Must/Should/Could）:
  - Must: 認識・返却・確定処理
  - Should: S3保存
  - Could: モデル別チューニング

### 5.2 非機能要件

- 性能: 逐次認識で対話遅延を抑える
- 可用性: WebSocket切断時にセッションを正常終了
- スケーラビリティ: workerを増やして水平分散可能
- セキュリティ: 内部ネットワーク通信前提
- 運用性/保守性: 共通endpointでモデル差し替え可能
- 監視性: `/statuses` と認識時間ログ

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - Process: `SpeechRecognizerProcess` / `SpeechRecognizerNemoProcess`
  - Worker: `SpeechRecognizerWorker` / `SpeechRecognizerNemoWorker`
  - モデルラッパ: `SpeechRecognizer` / `SpeechRecognizerNemo`
  - 補助: `SpeechRecognizerS3Client`
- 責務分割:
  - Process: API、Consul登録、接続管理
  - Worker: 認識実行、ログ保存
  - Model: 推論とトークン/スコア変換
- 外部依存:
  - `sincro-models`, `fastapi`, `nemo` or `nue_asr`, `boto3`
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/backend_speech_recognizer_flow.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - Process: `SpeechExtractorResult` 受信、同一speech_idのvoice連結、Worker呼び出し
  - Worker: `recognize()` 実行、`SpeechRecognizerResult` 生成
  - S3Client: confirmed結果を `speech-recognizer` バケットへ保存
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-server/speech-recognizer/SpeechRecognizerProcess.py`
  - `sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py`
  - `sincromisor-server/speech-recognizer/src/speech_recognizer/SpeechRecognizer/SpeechRecognizerWorker.py`
  - `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py`
- 変更時に同時確認が必要なファイル:
  - 出力構造変更: `SpeechRecognizerResult.py` と `TextProcessorSenderThread.py`
  - 入力構造変更: `SpeechExtractorResult.py` と Process側バッファ連結ロジック
  - モデル切替変更: `compose/speech-recognizer.yml` と `examples/compose.env`

### 7.2 データ設計

- 主要データ構造:
  - 入力: `SpeechExtractorResult`
  - 出力: `SpeechRecognizerResult` (`result: list[(token, score)]`)
- 永続化対象:
  - confirmed時のJSON/音声ログ（ローカル + S3任意）
- スキーマ/モデル:
  - `sincro-models` の `SpeechRecognizerResult`, `SpeechExtractorResult`
- バージョニング方針:
  - 下流TextProcessor互換を優先

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - `GET /api/v1/SpeechRecognizer/statuses`
  - `WS /api/v1/SpeechRecognizer/recognize`
- リクエスト仕様:
  - `SpeechExtractorResult` (msgpack)
- レスポンス仕様:
  - `SpeechRecognizerResult` (msgpack)
- エラー仕様:
  - 例外時はログ出力し接続終端
- タイムアウト/リトライ方針:
  - サーバー側積極再試行なし。上位再接続に委譲

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - Extractor結果受信 -> speech_id単位連結 -> 認識 -> 結果送信
  - confirmedで確定時はログ/S3保存
- 異常系フロー:
  - 推論失敗 -> 例外ログ -> セッション終了
  - S3保存失敗 -> エラーログのみ（処理継続）
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - `documents/design/networking_websocket.md` 参照

## 8. 設定・デプロイ

- 環境変数:
  - `SINCRO_RECOGNIZER_HOST`, `SINCRO_RECOGNIZER_PORT`
  - `SINCRO_RECOGNIZER_PUBLIC_BIND_HOST`, `SINCRO_RECOGNIZER_PUBLIC_BIND_PORT`
  - `SINCRO_RECOGNIZER_VOICE_LOG_DIR`
  - `SINCRO_S3_ACCESS_KEY`, `SINCRO_S3_SECRET_KEY`
  - `SINCRO_RECOGNIZER_MODEL` (`nemo`/`nue`)
- 設定ファイル:
  - `compose/speech-recognizer.yml`
  - `examples/compose.env`
- 起動方法:
  - nue: `uv run speech-recognizer/SpeechRecognizerProcess.py`
  - nemo: `uv run speech-recognizer-nemo/SpeechRecognizerNemoProcess.py`
- デプロイ/ローカル実行手順:
  - `docker compose --profile backend up -d speech-recognizer`
- 互換性に影響する設定変更:
  - モデル切替による精度/遅延特性差

## 9. 監視・運用

- ログ設計:
  - query_time, voice_size, result を出力
- メトリクス:
  - `/statuses` sessions
- 障害時の切り分け手順:
  - 1. `/statuses` 疎通
  - 2. 受信パケットの `speech_id/sequence_id` の流れ確認
  - 3. GPU/モデルロード状態確認
  - 4. S3設定時は書き込み権限確認
- よくある失敗と対処:
  - モデルロード失敗 -> イメージ/依存確認
  - VRAM不足 -> `SINCRO_RECOGNIZER_MODEL=nemo` を利用

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 単体実装なし
- 秘密情報の扱い:
  - S3キーは環境変数で注入
- 入力検証:
  - msgpack復元時に型検証
- 脅威と対策:
  - 無効データは例外で処理停止
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - partial/confirmed遷移、speech_id連結、モデル差し替え
- 単体テスト:
  - Worker単位（必要時）
- 結合テスト:
  - Extractor->Recognizer->TextProcessor 連鎖確認
- E2Eテスト:
  - 発話がチャット表示に反映されることを確認
- 負荷テスト（必要な場合のみ）:
  - 連続発話時の推論遅延計測
- 受け入れ条件:
  - `SpeechRecognizerResult.resultText` が期待通り生成される

## 12. 既知課題・リスク

- 既知課題:
  - modelごとの語彙/score挙動が異なる
- 技術的負債:
  - 2実装並立の保守コスト
- リスク一覧:
  - 認識遅延増大で下流応答が遅れる
- 軽減策:
  - Nemo優先運用、ログベース調整

## 13. 代替案と設計判断

- 検討した代替案:
  - 単一モデルに固定
- 採用しなかった理由:
  - 環境差（VRAM/精度）に対応しづらい
- 最終判断:
  - API互換を維持しつつモデル切替を許容

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/networking_websocket.md`
  - `documents/design/backend_text_processor.md`
- 参照実装:
  - `sincromisor-server/speech-recognizer/SpeechRecognizerProcess.py`
  - `sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py`
  - `sincromisor-server/sincro-models/src/sincro_models/SpeechRecognizerResult.py`
