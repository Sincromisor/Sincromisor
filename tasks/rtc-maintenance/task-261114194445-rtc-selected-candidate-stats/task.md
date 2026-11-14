# RTC統計を使用中の候補ペアから取得する

## 背景 / 目的

WebRTC実装のモダナイズレビューで挙げた指摘3への対応。2026-11-14、HEAD `0268ee7d9`で関連コードを確認した。

通常の統計表示と障害時診断は、`selected || nominated`を満たす候補ペアの先頭を使用中の経路と扱っている。経路変更後も古い候補が残る統計では、現在選択されている経路と異なるRTT・候補種別を表示・報告し得る。

模擬統計で、`transport.selectedCandidatePairId`が指す現経路のRTTを10ms、先頭の旧候補のRTTを500msにすると、通常表示が500msになることを確認済み。これは試験入力であり実回線の測定値ではない。

標準の参照IDから使用中の候補ペアを求め、経路切替時の誤診断を防ぐ。

## 完了条件（受け入れ条件）

- [x] 音声の統計に対応する`transport`の`selectedCandidatePairId`から候補ペアを参照し、候補一覧の順番や旧候補の`nominated`に左右されずRTT・候補種別・経路情報を取得する。
- [x] 通常表示と障害時診断の双方が同じ選択規則を使う。複数の`transport`がある場合、無関係な経路を先頭順で選ばない。対応する経路を特定できなければ取得不能として扱う。
- [x] 選択IDがない、または参照先の候補ペア・候補情報がない場合は、取得できない項目だけ表示を`-`、診断を省略とし、旧候補から推測で補わない。
- [x] 候補総数・成功候補数の集計、取得開始時のセッションID保持、中央診断へのIP・ポート・候補ID非送信を維持する。
- [x] [デバッグ項目一覧](../../../documents/design/frontend/setting-and-debug-ui/debug-items.md)へ、使用経路の取得方法と取得不能時の表示を反映する。

## 設計判断とスコープ

`RTCStatsReport`内の標準参照関係を使う。音声RTP統計の`transportId`を起点とし、RTP統計がない接続失敗時には一意に特定できる`transport`だけを扱う。参照できない経路の推測や非標準の`selected`による代替は追加しない。

[RTC契約](../../../documents/design/contracts/frontend-rtc.md)の診断形式・省略規則を維持する。表示項目追加、ジッターバッファ調整、通信経路の選択制御、サーバー変更は対象外とする。

## 主な変更範囲

- [統計レコード](../../../sincromisor-frontend/src/features/rtc/diagnostics/rtcStatsRecords.ts): 標準の参照に必要な型・取得処理。
- [通常の統計表示](../../../sincromisor-frontend/src/features/rtc/diagnostics/rtcStatsReporter.ts)と[障害時診断](../../../sincromisor-frontend/src/features/rtc/diagnostics/rtcIceDiagnostics.ts): 使用経路の判定を同期する。
- [既存の障害診断試験](../../../sincromisor-frontend/src/features/rtc/diagnostics/__tests__/rtcIceDiagnostics.test.ts)と通常表示の対象試験。

## 確認方法

- 古い候補が先頭に残り、標準の選択IDが後方の候補を指す固定統計で、通常表示・障害時診断とも現経路の値を使うことを確認する。
- 選択IDなし、参照先欠落、RTP統計なし、複数の`transport`を持つ固定統計で、無関係な経路を選ばないことを確認する。
- `npm run test -- src/features/rtc`、型検査、変更したTypeScriptのBiome検査を行う。既存の診断項目制限の試験も維持する。
- ブラウザーの統計を模した固定入力で参照関係を検証できるため、実回線の切替や性能測定は必須としない。

## 参照仕様

[W3C WebRTC Statistics](https://www.w3.org/TR/webrtc-stats/#dom-rtctransportstats-selectedcandidatepairid)を2026-11-14に参照した。`transportId`と`selectedCandidatePairId`で統計を関連付ける定義を採用する。

## 実装・確認結果

音声RTPの`transportId`と`selectedCandidatePairId`を辿る共通処理を通常表示・障害診断から利用するよう変更した。RTP統計がない場合だけ一意のtransportを使い、参照欠落や複数音声経路では推測しない。候補の片側やRTTだけが欠ける場合は取得済み項目を維持する。デバッグ項目一覧を同期し、統計参照・表示・集計のコメントを点検した。

- `npm run test -- src/features/rtc`: 99件成功。統計順の反転、旧候補、映像を含む複数transport、欠損・種別不一致、RTPなし、部分欠損、再収集時の古い表示の消去を確認。
- 既存の障害診断試験で取得開始時の会話ID保持、候補総数・成功数、中央診断へのIP・ポート・候補ID非送信を確認。
- TypeScript型検査、変更TypeScriptのBiome、変更MarkdownのPrettier、タスク検査: 成功。
- 実回線の切替・性能測定は実施していない。固定統計で参照関係を検証した。
