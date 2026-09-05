# 設計ドキュメント

## 最初に読む

- [設計ドキュメント運用ガイド](documentation-guide.md)
    - 設計文書の種別、更新手順、分割基準、ベストプラクティス、索引からの導線ルール

## 目的別入口

- 新しい設計文書を作る:
    - [設計ドキュメント運用ガイド](documentation-guide.md) の「新規文書作成手順」を確認し、`templates/` 配下のテンプレートを使う
- 既存文書を更新する:
    - 変更内容が現在設計、契約仕様、判断記録、移行計画のどれかを分類してから更新する
- 文書が肥大化したため分割する:
    - [設計ドキュメント運用ガイド](documentation-guide.md) の「分割判断基準」と「再編ロードマップ」を確認する
- エンドポイント / 送受信データ / DataChannel / 環境変数を変更する:
    - 契約仕様と関連するフロントエンド / バックエンドの両方を確認する
- 採用理由や棄却理由を残す:
    - 設計判断記録として ADR を追加する

## テンプレート

新規文書は、内容に合わせて下記テンプレートを使う。

- [現在設計](templates/current-design.md)
    - 現在の実装構造を説明する文書
- [契約仕様](templates/contract-spec.md)
    - エンドポイント / チャネル / 送受信データ / 環境変数など、互換性に関わる契約仕様
- [設計判断記録](templates/decision-record.md)
    - 採用理由、棄却理由、見直し条件を残す ADR
- [取り組み計画](templates/initiative-plan.md)
    - 進行中の移行・大きな設計変更の計画

## 旧テンプレート

- [設計ドキュメントテンプレート](template.md)
    - 旧 15 章テンプレート。既存文書の参照用として残し、新規文書は原則 `templates/` 配下を使う。

## 構成

- [概要](architecture/overview.md)
    - Sincromisor 全体のコンポーネント境界と責務
- [実行時の処理の流れ](architecture/runtime-flow.md)
    - 起動から会話成立までの代表フロー

## 契約

互換性に関わるエンドポイント / チャネル / 送受信データ / 形式の仕様。

- [フロントエンドのRTC](contracts/frontend-rtc.md)
    - フロントエンドと `sincro-rtc` の WebRTC シグナリング、ICE 再起動・再試行、DataChannel 契約
- [音声パイプラインのWebSocket](contracts/audio-pipeline-websocket.md)
    - Goパイプライン調停器と下流音声処理サービス間の WebSocket / msgpack 契約
- [固有名詞辞書](contracts/proper-noun-dictionary.md)
    - SpeechRecognizer 固有名詞補強で使う CSV 辞書仕様

## フロントエンド

- [アプリの共通枠組み](frontend/app-shell.md)
    - Vite MPA、Reactによるアプリの共通枠組み、制御処理境界
- [ページ構成](frontend/pages.md)
    - 現行 / 実験用ページ分類とビルド対象
- [設定と診断UI](frontend/settings-and-debug-ui.md)
    - 起動前ダイアログ、右側ツールパネル、診断 Console
- [VAD](frontend/audio/vad.md)
    - フロント側 VAD と診断 Console 観測項目
- [キャラクター概要](frontend/character/overview.md)
    - VRM 描画、会話モード、動作 / 追跡の大枠
- [キャラクター動作](frontend/character/motion.md)
    - 口形、表情、視線、待機 / ジェスチャー、姿勢の変換適用境界
- [キャラクター追跡](frontend/character/tracking.md)
    - CharacterGaze、Face/Pose 追跡処理、Worker 代替処理

## バックエンドサービス

- [sincro-rtc](backend/services/sincro-rtc.md)
    - WebRTC シグナリング、RTC セッション、パイプライン調停器
- [SpeechExtractor](backend/services/speech-extractor.md)
    - 音声区間抽出
- [SpeechRecognizer](backend/services/speech-recognizer.md)
    - 音声認識と固有名詞補強の接続点
- [TextProcessor](backend/services/text-processor.md)
    - 応答テキスト、チャットメッセージ、テロップ生成
- [VoiceSynthesizer](backend/services/voice-synthesizer.md)
    - 応答テキストから音声フレームへの変換

## インフラ

- [Docker Compose](infrastructure/compose.md)
    - Docker Compose プロファイル、環境変数受け渡し、ローカル起動
- [Consul](infrastructure/consul.md)
    - サービス発見と代替処理設定
- [保存領域](infrastructure/storage.md)
    - Redis、SeaweedFS、旧 MinIO の扱い

## 設計判断

- [ADR-260726 Pionコーデックの概念実証](decisions/ADR-260726-pion-codec-poc.md)
- [ADR-260222 React移行](decisions/ADR-260222-react-migration.md)
- [ADR-260430 重ねて表示する画面の外枠の責務](decisions/ADR-260430-overlay-frame.md)
- [ADR-260412 固有名詞認識の補強方針](decisions/ADR-260412-proper-noun-biasing.md)
- [ADR-260517 Sincroの腕IKソルバーの採用](decisions/ADR-260517-sincro-arm-ik-solver-adoption.md)

## 移行

- [PionへのWebRTC移行](../migration/pion/README.md)

## 取り組み計画

- [React移行](initiatives/react-migration.md)
- [固有名詞認識の補強](initiatives/proper-noun-biasing.md)

## 廃止予定と削除済み

- Nue-ASRは廃止予定。`sincromisor-server/speech-recognizer/` の実装は残っており、現行のNeMo実装は `sincromisor-server/speech-recognizer-nemo/` にある。
- Babylon.jsの旧ページと関連実装・依存は削除済み。現行描画はThree.js + VRM 1.0を使う。
- MinIOはSeaweedFSへ移行済み。旧設定の `compose/minio.yml` と `Docker/minio/` は残るが、通常のCompose構成には含めない。現在の保存領域は[保存領域の設計](infrastructure/storage.md)を参照する。

## 保管領域

再編前の肥大化したファイルは、履歴参照用として [archive/legacy-flat](archive/legacy-flat/README.md) に退避した。通常の変更ではアーカイブを更新せず、現在設計、契約、ADR、取り組み計画のいずれかを更新する。

## 残課題

- TODO は設計本文に溜めず、必要に応じて `tasks/` に起票する。
