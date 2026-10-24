# 設計ドキュメント

この索引は、変更・調査対象に対応する設計を選ぶための入口である。構造を調べる場合は「構成」、通信を変更する場合は「契約」、画面を変更する場合は「フロントエンド」から必要な文書を読む。文書の作成・分割・廃止には [設計ドキュメント運用ガイド](documentation-guide.md) を使う。

## 構成

- [概要](architecture/overview.md)
    - Sincromisor全体のコンポーネント境界と責務
- [実行時の処理の流れ](architecture/runtime-flow.md)
    - 起動から会話成立までの代表的な処理の流れ

## 契約

互換性に関わるエンドポイント / チャネル / 送受信データ / 形式の仕様。

- [フロントエンドのRTC](contracts/frontend-rtc.md)
    - フロントエンドと `sincro-rtc`のWebRTCシグナリング、ICE再起動・再試行、DataChannel契約
- [音声パイプラインのWebSocket](contracts/audio-pipeline-websocket.md)
    - Goパイプライン調停器と下流音声処理サービス間のWebSocket / msgpack契約
- [固有名詞辞書](contracts/proper-noun-dictionary.md)
    - SpeechRecognizer固有名詞補強で使うCSV辞書仕様

## 開発環境

- [WSL2の開発・動作検証環境](../../utils/setup-devenv/README.md)
    - Ubuntu 26.04への導入スクリプトと確認手順。一括導入は未検証。

## フロントエンド

- [アプリの共通枠組み](frontend/app-shell.md)
    - Vite MPA、Reactによるアプリの共通枠組み、制御処理境界
- [ページ構成](frontend/pages.md)
    - 現行 / 試作 / 実験用ページの分類、ビルド、トップページモックと採用画像のプロンプト
- [設定UIとデバッグUI](frontend/setting-and-debug-ui/README.md)
    - 設定UI・デバッグUIの設計と全項目一覧。既定値、入力範囲、表示条件、反映タイミング
- [VAD](frontend/audio/vad.md)
    - フロント側VADと診断Consoleの観測項目
- [キャラクター概要](frontend/character/overview.md)
    - VRM描画、会話モード、動作 / 追跡の大枠
- [キャラクター動作](frontend/character/motion.md)
    - 口形、表情、視線、待機 / ジェスチャー、姿勢の変換適用境界
- [キャラクター追跡](frontend/character/tracking.md)
    - CharacterGaze、Face/Pose追跡処理、Worker代替処理

## バックエンドサービス

- [sincro-rtc](backend/services/sincro-rtc.md)
    - WebRTCシグナリング、RTCセッション、パイプライン調停器
- [SpeechExtractor](backend/services/speech-extractor.md)
    - 音声区間抽出
- [SpeechRecognizer](backend/services/speech-recognizer.md)
    - 音声認識と固有名詞補強の接続点
- [TextProcessor](backend/services/text-processor.md)
    - 応答テキスト、チャットメッセージ、テロップ生成
- [AgentServer](backend/services/agent-server.md)
    - Mastra API、管理者用Studio、会話履歴と認証
- [VoiceSynthesizer](backend/services/voice-synthesizer.md)
    - 応答テキストから音声フレームへの変換

## インフラ

- [ログの保存と検索](infrastructure/logging.md)
    - VictoriaLogsと共通ログ項目、保持期間、検索手順

- [Docker Compose](infrastructure/compose.md)
    - Docker Composeプロファイル、環境変数受け渡し、ローカル起動
- [コンテナイメージの公開](infrastructure/image-publishing.md)
    - GHCRへの月次更新、認証、旧構成の整理、失敗時の再開
- [Consul](infrastructure/consul.md)
    - サービス発見と代替処理設定
- [保存領域](infrastructure/storage.md)
    - Redis、SeaweedFS、保存データと認証の扱い

## 設計判断

- [ADR-260726 Pionコーデックの概念実証](decisions/ADR-260726-pion-codec-poc.md)
- [ADR-260222 React移行](decisions/ADR-260222-react-migration.md)
- [ADR-260430重ねて表示する画面の外枠の責務](decisions/ADR-260430-overlay-frame.md)
- [ADR-260412固有名詞認識の補強方針](decisions/ADR-260412-proper-noun-biasing.md)
- [ADR-260517 Sincroの腕IKソルバーの採用](decisions/ADR-260517-sincro-arm-ik-solver-adoption.md)

## 完了済みの移行

- [PionへのWebRTC移行](../migration/pion/README.md)
    - 旧Python RTC実装の削除まで完了した移行の記録。現在の通信仕様は契約とサービス設計を参照する。

## 調査資料

- [キャラクターアニメーションの調査とロードマップ](../research/character_animation/roadmap.md)
    - 調査時点の提案と実装状況。現在の動作・追跡仕様はフロントエンドのキャラクター設計を参照する。

## 取り組み計画

- [React移行](initiatives/react-migration.md)
- [固有名詞認識の補強](initiatives/proper-noun-biasing.md)
    - 各段階の実装は完了済み。導入方針と評価観点を参照する。

## 廃止予定と削除済み

- 音声認識はNeMoのみ対応する。実装は [`sincromisor-server/speech-recognizer-nemo/`](../../sincromisor-server/speech-recognizer-nemo/)にある。
- Babylon.jsの旧ページと関連実装・依存は削除済み。現行描画はThree.js + VRM 1.0を使う。
- MinIOは利用対象から除外し、旧Compose・Docker定義も削除済み。S3には検証用構成を含めSeaweedFSを使う。現在の保存領域は[保存領域の設計](infrastructure/storage.md)を参照する。

## 保管領域

- [再編前の設計](archive/legacy-flat/README.md): 履歴参照用。通常の変更は現在設計、契約、ADR、取り組み計画へ反映する。
- [旧15章テンプレート](template.md): 既存文書の参照用。新規文書は[文書種別に応じたテンプレート](documentation-guide.md#3-文書種別とテンプレート)を使う。
