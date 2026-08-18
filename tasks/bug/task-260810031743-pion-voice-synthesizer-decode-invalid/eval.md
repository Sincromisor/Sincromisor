# 評価: task-260810031743-pion-voice-synthesizer-decode-invalid

## 判定

FAIL

## 根拠

- 実装コミット `ebd097978227fdf71200b7d1f50b1b969d5d6235` を親との差分で確認した。`generate_fixtures.py` は Python の実 `VoiceSynthesizerResult.to_msgpack()` に既存 `tone-opus.ogg`、`audio/ogg;codecs=opus`、有限な timing を渡して fixture を生成し、`--check` は PASS した。Go 側も MessagePack 外側の `voice` が Ogg/Opus byte列であることを確認し、`TestFFmpegDecodesPythonSynthesizerFixture` が `DecodeSynthesizerResult` と実 FFmpeg decoder を通して 48 kHz mono の非空 PCM、`speaking_time`、PCM 範囲内の mora を確認している。
- `DecodeError.Reason` は空 voice、PCM 不正、発話時間不一致、mora 範囲外、入力 timing 不正を固定値へ写像し、`codecErrorDetails` はそれ以外の `DecodeError` と非 `DecodeError` を `unknown` に閉じる。capture test は全5 reason、既存 kind、payload・本文・FFmpeg stderr 非出力を確認している。運用上の公開ログ属性追加は同コミットの `documents/migration/pion/phase-4-cutover-runbook.md` に同期されている。
- `npm run gate` は同一 clean commit の cache hit で PASS。`go test ./internal/pipeline/protocol ./internal/media/synthdecode ./internal/rtc` は PASS（RTC は sandbox の netlink 制限後、許可済み環境で再実行）。
- 受け入れ条件4は未達。コミット本文に「VOICEVOX を含む compose 実機1 turn はこの worktree では未実行」とあり、task directory の `acceptance/`・`artifacts/` に evidence はない。そのため、`synthesizer_result_received` 後に `codec_error` を出さず session を維持して再生できることを確認していない。

## 残課題

- `task.md` の受け入れ条件4どおり、既存 compose で VOICEVOX を含む Pion 1ターンを実行し、対象 session について `synthesizer_result_received` 後の codec error 不在、接続維持、非無音音声再生を private evidence で確認する。失敗時は reason と対象境界を task 記録へ残し、修正後に同じ実機確認と `npm run gate` を再検証する。

---

## 再評価

### 判定

PASS

### 根拠

- 初回 FAIL の受け入れ条件4は、private evidence `work/private-artifacts/task-260810031743-pion-voice-synthesizer-decode-invalid/result.md` と `impl.md` で解消を確認した。外部 Dify の接続拒否時は compose 内部 network の一時 SSE で TTS 入力だけを供給し、実 VoiceSynthesizer・VOICEVOX・Pion の1ターンで `synthesizer_result_received`、ICE connected、text/telop、audio peak 16、`codec_error` なし、終了後 active session 0を確認している。payload、本文、session ID は artifact に残しておらず、一時 container と設定も復元済みである。
- `codecErrorDetails` は `ErrorInvalid` 以外を必ず `codec_error_reason=unknown` にし、5つの有限 reason だけを `ErrorInvalid` から出す。`ErrorProcess` に `empty_voice` を混入した capture test も `unknown` を確認しており、初回指摘を解消した。変更シンボルと直接の decoder / outbound flow のコメントは、固定値域、payload非出力、境界の責務を説明しており、コメント点検は PASS。
- fixture `--check` は PASS。focused Go test、対象 package test、`go vet ./...`、`gofmt -l .`、`npm run gate` は PASS。`go test ./...` は変更外の一過性 ICE timeout 後、signaling package の再試験と全体再試験で PASS した。

### 残課題

- なし
