# PionのVoiceSynthesizer音声契約違反を特定・修正する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

VOICEVOX は `audio_query` と `synthesis` を HTTP 200 で完了し、Pion は Synthesizer result を
受信している。しかし Pion decoder は `codec_error_kind=invalid` を返して session を閉じる。
この分類は空 voice、decoded PCM の不正、`speaking_time` と実音声長の不一致、mora timing の範囲外を
含むため、VoiceSynthesizer→MessagePack→Pion decoder の実際の契約値を固定し、原因を特定・修正する。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] VoiceSynthesizer の `VoiceSynthesizerResult.to_msgpack()` が作る実形式の fixture を、既存の
      `tone-opus.ogg` を `voice` に使って生成する。Pion の `DecodeSynthesizerResult` と
      `synthdecode.Decode` がその fixture を通し、48 kHz mono の非空 PCM、宣言どおりの
      `speaking_time`、PCM 範囲内の mora を得ることを結合テストで検証する。
- [ ] fixture は MessagePack の外側を `voice` に入れず、Ogg/Opus byte列、`audio/ogg;codecs=opus`、
      finite な timing を境界ごとに検証する。sampling rate / channel の入力値は FFmpeg の既存の
      48 kHz mono 正規化へ渡し、独自の再サンプリングや channel 変換を追加しないこと。
- [ ] 実機で得た `invalid` の原因を、payload・転写本文・FFmpeg stderr を出さない有限の
      `codec_error_reason` としてログへ記録する。少なくとも `empty_voice`、`decoded_pcm_invalid`、
      `speaking_time_mismatch`、`mora_timing_invalid`、`input_timing_invalid` を区別し、
      `DecodeError` 以外は `unknown` とする。
- [ ] 原因箇所を修正後、VOICEVOX を含む既存 compose の Pion 1ターンで
      `synthesizer_result_received` 後に `codec_error` を出さず、session が接続を維持して音声を
      再生することを private evidence で確認する。失敗時は reason と対象境界を task 記録へ残し、
      PASS にしないこと。

## 設計判断

`audio_format=audio/ogg;codecs=opus` は VoiceSynthesizerWorker が供給し、Pion decoder が消費する
既存 wire 値を使う。Pion decoder の FFmpeg は入力を 48 kHz mono s16le に正規化する責務を維持する。
診断理由は既存の `ErrorKind=invalid` を詳細化するログ属性だけであり、音声 payload を保存・出力しない。

`codec_error_reason` は decoder error ごとに常に出力する。`codec_error_kind` は既存の粗い分類として
変更しない。reason は次の固定値だけを使う。`voice` が空なら `empty_voice`、FFmpeg 成功後の stdout が
空または s16le sample 境界で割り切れなければ `decoded_pcm_invalid`、decoded PCM と
`speaking_time` の許容差外なら `speaking_time_mismatch`、PCM 範囲外へ伸びる mora cumulative timing
なら `mora_timing_invalid`、FFmpeg 起動前の非 finite / 負の `speaking_time` または mora length なら
`input_timing_invalid` とする。これ以外の `DecodeError`（unsupported、limit、timeout、process、
decode context 不正を含む）と非 `DecodeError` は `unknown` とする。これにより自由文の Cause を解析・
記録せず、値域を5原因と `unknown` に閉じる。

## スコープ境界

対象は `sincro-models` の VoiceSynthesizer MessagePack producer、Pion protocol fixture / decoder / RTC
ログ、および Gate 4 runbook である。VOICEVOX の話者・クエリ内容、Frontend、codec の追加、
decoder error 時の session close 方針は対象外とする。

## 実装方針

既存 `internal/media/synthdecode/testdata/tone-opus.ogg`、protocol fixture generator、
`synthdecode.DecodeError`、RTC の capture logger test を再利用する。fixture は Python producer が
serialize した bytes を Go consumer が読む形式にし、疑似 DTO を二重実装しない。原因が producer、
protocol decode、timing のどれかに確定した箇所だけを修正する。

## テスト

Python fixture generator / model のテスト、`go test ./internal/pipeline/protocol ./internal/media/synthdecode ./internal/rtc` を
必須とする。`go test ./...`、`go vet ./...`、`gofmt -l .`、`npm run gate` を実行する。

## ドキュメント同期の要否

wire field の追加・変更はない。運用時に reason を使って切り分けるため、
`documents/migration/pion/phase-4-cutover-runbook.md` を同期する。
