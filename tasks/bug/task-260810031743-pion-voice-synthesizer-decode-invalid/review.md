# レビュー: task-260810031743-pion-voice-synthesizer-decode-invalid

## 判定

APPROVED

## 理由・申し送り

- 完了条件は fixture の producer/consumer 境界、48 kHz mono PCM・`speaking_time`・mora の検証、ログの有限値域、実機 1 turn の観測点まで一意で検証可能である。実機確認の失敗は証拠採取後に原因を特定し、修正・再検証または明示的移管を要するため、記録だけで完了にはできない。
- `codec_error_reason` の値域と境界が一意に定義された。現行 `synthdecode.Decoder.Decode` の空 voice、FFmpeg 後 PCM、`validateSpeakingTime`、`mapMora`、`validateInputTiming` にそれぞれ対応し、unsupported / limit / timeout / process / context 不正および非 `DecodeError` を `unknown` に閉じるため、payload・本文・FFmpeg stderr をログへ漏らさず capture test と runbook を実装できる。
- 対象は Python MessagePack producer、Go protocol/decoder/RTC 観測、Gate 4 runbook に限定され、codec 追加、Frontend、session close 方針を除外している。既存の `tone-opus.ogg`、fixture generator、`DecodeSynthesizerResult`、`Decode`、capture logger test と整合する。wire field は変えないため、運用上の同期先を `documents/migration/pion/phase-4-cutover-runbook.md` に定めれば足りる。

## 自律補完

- `AUTO_FIX`: sampling rate / channel の wire input field は現行 `VoiceSynthesizerResult` 契約にないため、「既存の 48 kHz mono 正規化へ渡す」は、`voice` container を FFmpeg に入力し、既存の `-ac 1 -ar 48000` のみを維持して独自の再サンプリング・channel 変換や field を追加しない意味として実装する。根拠は `documents/design/contracts/audio-pipeline-websocket.md` と `internal/media/synthdecode/decoder.go`。
- `AUTO_FIX`: fixture は既存 Python generator を更新し、`tone-opus.ogg` の bytes を `VoiceSynthesizerResult.to_msgpack()` の `voice` binary に直接入れる。生成物の MessagePack 外側と Go consumer が同じ bytes を扱うことを結合テストで確認する。根拠は既存 `internal/pipeline/protocol/testdata/generate_fixtures.py`、`manifest.json`、`DecodeSynthesizerResult` である。
- `AUTO_FIX`: 実装時のコメント基準は task.md へ複製せず、decoder の失敗分類と RTC の観測境界を変更する際に `documents/rules/source-comments.md` を直接参照する。
