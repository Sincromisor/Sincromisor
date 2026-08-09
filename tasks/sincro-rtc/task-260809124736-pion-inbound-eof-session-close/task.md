# Pionの入力EOFでsessionを終了する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

Gate 4 stagingで、browserが切断した後もPion session `01KZHPAV1ABG1E6PBHHT4915QF`がconnectedのまま
6時間以上registryに残った。`/statuses`は`1`、metricsはcreated `4` / closed `3` / active `1`であり、
リハーサルの収束条件を満たせない。

`Session.startInbound` は`InputProcessor.Run`の正常EOFをreturnするだけでsessionを閉じない。ブラウザ終了時に
PionのICE callbackが`disconnected`へ遷移しない経路でも、入力RTP EOFをsession lifecycleの正常終了として扱う。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] running sessionの入力RTP readerが`io.EOF`を返すと、sessionが一度だけ`normal`でcloseされ、
      Manager registryと`active session` metricsから除去される。
- [ ] context cancelによる入力worker終了、decode/submit失敗時の`media_read_error`、ICE recoveryの既存close
      条件を変更しない。
- [ ] 既存のin-memory WebRTC session testでclient close後のregistry収束を回帰確認する。
- [ ] `go test ./...` と `npm run gate` が成功する。

## 設計判断

RTP readerのEOFは入力を供給するbrowserが正常終了したことを示すため、Session境界で`normal` closeへ
集約する。独立したidle timerや新しい設定は追加しない。

## スコープ境界

対象は`internal/rtc/session`の入力workerと既存session lifecycle testである。

stagingでの再deploy、browser smoke、Pion/aiortc切替とGate 4判定は
`task-260809020145-pion-phase-4-cutover-rehearsal`が担当する。

## 実装方針

`startInbound`のEOF分岐から既存`Session.Close("normal")`を呼び、close-onceとManager callbackを再利用する。
`session_test.go`のremote client close / registry wait helperを使い、Pion実装の実際のEOF経路を確認する。

## テスト

- `go test ./internal/rtc`
- `go test ./...`（`sincro-rtc-pion-poc`）
- `npm run gate`

## ドキュメント同期の要否

不要。HTTP / WebRTC / pipeline protocolは変えず、既存の正常session終了を完結させる内部lifecycle修正である。
