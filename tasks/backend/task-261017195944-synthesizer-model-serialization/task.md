# 音声合成モデルの変換をPydanticの標準処理へ集約する

## 背景 / 目的

VoiceSynthesizerResultはフィールド列挙、子モデル別の変換、復元を手書きしている。Pydanticの入れ子モデル処理へ集約し、VOICEVOXのJSON読取りも中間辞書を省ける箇所を整理する。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [VoiceSynthesizerResult.py](../../../sincromisor-server/sincro-models/src/sincro_models/VoiceSynthesizerResult.py)
- [VoiceVox.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceVox.py)
- [voice_synthesizer_result.msgpack](../../../sincromisor-server/sincro-rtc/internal/pipeline/protocol/testdata/voice_synthesizer_result.msgpack)

## 設計判断

- MessagePack出力にはmodel_dumpのPython値、JSON出力にはvoiceを除くmodel_dump_json、復元にはmodel_validateを利用する。不要になった型別変換とimportを削除する。
- speech_id省略時の-1、voiceのバイナリ、必須フィールドと入れ子の検証を維持する。JSONには音声を含めない。モデルの全項目が既存の送信対象と一致することを確認する。
- audio_queryのJSON応答はmodel_validate_jsonで直接読む。HTTP状態の検査を先に行い、入力本文やURLを診断へ追加しない。
- 起票時の簡易照合はホストのPydantic 2.13.5によるものだった。実装の確認はuv.lockの採用版を使い、ホストの導入版と同じと仮定しない。

## 完了条件と確認方法

- [ ] 既存固定データで変換前後のMessagePackを復号した値とJSON値が一致し、speech_id省略時の復元が一致する。バイト配列の並び順やJSONの空白を新しい契約にしない。
- [ ] 必須項目欠落・不正なモーラ・不正JSONを拒否し、VOICEVOXのHTTP失敗を従来どおり扱う。
- [ ] 対象Python試験と、sincro-rtcディレクトリでgo test ./internal/pipeline/protocolを実行しGo側受理も確認する。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

他モデルの一括置換、MessagePackライブラリ交換、検証省略、キャッシュ形式・音声形式・通信スキーマの変更。

## 文書と契約

設計の外部契約は変更しない。確認結果と判断はこのタスクへ記録する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [入れ子モデルの検証と変換](https://pydantic.dev/docs/validation/latest/concepts/models/)。
- [model_validate_jsonによる直接検証](https://pydantic.dev/docs/validation/latest/concepts/performance/)。
