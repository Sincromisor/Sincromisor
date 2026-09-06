# バックエンドサービス: SpeechRecognizer

## 要約

- SpeechRecognizer は抽出済み音声区間をテキストへ変換する下流サービスである。
- 現行の主対象は Nemo 音声認識処理で、Nue-ASR は廃止済みで、コンテナの `SINCRO_RECOGNIZER_MODEL` は `nemo` のみ受け付ける。
- 固有名詞補強は取り組み計画と辞書契約に分離する。

コンテナはCUDA 13.0系を使う。ホスト側の条件は[Compose設計](../../infrastructure/compose.md#nemoのgpu基盤)を参照する。

## 対象範囲

- 対象:
    - SpeechRecognizer サービス境界
    - Nemo 音声認識処理の認識結果
    - 確定 / 暫定の扱い
    - 固有名詞補強との接続点
- 非対象:
    - 音声抽出
    - TextProcessor の応答生成

## 責務

- Goパイプライン調停器から音声区間を受け取る。
- 音声区間を暫定 / 確定結果へ変換する。
- 必要に応じて確定結果に後処理を適用する。
- 結果を TextProcessor へ渡せる msgpack モデルとして返す。

## 固有名詞認識の補強

- 辞書仕様:
    - `documents/design/contracts/proper-noun-dictionary.md`
- 導入計画:
    - `documents/design/initiatives/proper-noun-biasing.md`
- 基本方針:
    - 暫定の低遅延経路を保つ。
    - 確定時に読み一致補正、文脈による認識候補の補強、上位N候補の再順位付けを段階導入する。
    - 未補正の音声認識結果と補正の追跡記録はデバッグ可能に残す。

## 変更時の確認

- `SpeechRecognizerResult` を変える場合は WebSocket 契約と TextProcessor を同時確認する。
- 辞書列を変える場合は固有名詞辞書の契約を更新する。
- 確定専用の重い処理を入れる場合は遅延と代替処理を確認する。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/contracts/proper-noun-dictionary.md`
- `documents/design/initiatives/proper-noun-biasing.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_biasing.md`
