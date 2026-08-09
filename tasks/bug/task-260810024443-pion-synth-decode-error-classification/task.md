# Pion合成音声decode errorを分類して観測する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

Pion は Synthesizer 結果受信後に `synthesized audio decode failed reason=codec_error` を出して
session を閉じるが、既存の `synthdecode.DecodeError` が持つ失敗分類を運用ログへ出していない。
実際の codec / FFmpeg / 入力制約のいずれを直すべきか、payload を公開せず特定できるようにする。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] `Session.handleSynthOutput` が `*synthdecode.DecodeError` を受けたとき、既存の
  `session_id` と `reason=codec_error` を保ったまま `codec_error_kind` に
  `unsupported`、`invalid`、`limit`、`timeout`、`process` のいずれかを記録すること。
- [ ] `DecodeError` 以外の decoder error でも session を `codec_error` で閉じ、
  `codec_error_kind=unknown` を記録して panic しないこと。
- [ ] capture logger を使う RTC のテストで、分類済み error と未分類 error の両方について、
  session close と上記の固定属性を検証すること。音声 byte、テキスト、FFmpeg stderr をログへ
  出さないこと。
- [ ] `documents/migration/pion/phase-4-cutover-runbook.md` に、`codec_error_kind` を記録して
  種別ごとに後続の修正タスクを判断する手順、および session ID と payload を Git artifact へ
  転載しない規則を追記すること。

## 設計判断

`synthdecode.ErrorKind` は decoder の既存の安定分類を再利用する。分類は診断専用であり、
decode error 時に session を閉じる現行の安全な挙動、metrics、wire format を変更しない。
未分類 error は `unknown` に正規化する。

## スコープ境界

対象は `sincro-rtc-pion-poc` の synth output error log とそのテスト、Gate 4 runbook である。
FFmpeg image、VoiceSynthesizer の出力形式、音声 decoder の対応 codec、再接続・再試行方針は、
この分類の実測後に別タスクで扱う。

## 実装方針

`internal/rtc/outbound.go` で標準ライブラリ `errors.As` を使い、既存
`internal/media/synthdecode.DecodeError` の `Kind` をログ属性へ渡す。テストは
`internal/rtc/outbound_test.go` の decoder fake と `slog` capture を再利用する。

## テスト

`go test ./internal/rtc` を必須とし、分類済み・未分類の decoder error を最小 fake で確認する。
変更範囲に応じて `go test ./...`、`go vet ./...`、`gofmt -l .`、`npm run gate` を実行する。

## ドキュメント同期の要否

通信契約・公開 UI の変更はない。運用時の観測手順を追加するため、
`documents/migration/pion/phase-4-cutover-runbook.md` を同期する。
