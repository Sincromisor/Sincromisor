# Pionで実音声を超える末尾モーラを安全に収める

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

`session_id=01M0FVH45QWGBJMQE3GR4N84HF` では、VoiceSynthesizer が返した音声を
48 kHz mono PCM へ正常に復号できた一方、最後の無音モーラだけが実音声の末尾を
1,047 samples（約21.8 ms）超えた。現行 `synthdecode.mapMora` は1 sampleでも超過すると
`mora_timing_invalid` を返し、RTC session全体を `codec_error` で閉じるため、正常な1ターンが
異常終了した。

VOICEVOXのモーラ長は実音声長と完全には一致しない既存producer値である。音声範囲外へ時刻を
公開せず、末尾の無音だけを実PCM末尾へ収めてsessionを継続できるようにする。

## 完了条件（受け入れ条件）

<!-- 利用者が求める最小の結果と、その確認方法。根拠のない性能値、網羅試験、環境matrixを追加しない。 -->

- [ ] それ以前のモーラがPCM範囲内にあり、最後のモーラが `text=nil`、`vowel=nil` の無音で
      PCM末尾を超える場合、`mapMora` はerrorにせず、その `EndSample` をPCM sample数に収める。
- [ ] 最後以外のモーラ、またはtext / vowelを持つ最後のモーラがPCM末尾を超える場合は、従来どおり
      `mora_timing_invalid` として拒否する。
- [ ] 65,024 samplesのPCMに対して最後の無音モーラだけが66,071 samplesまで伸びる今回相当の
      regression testでdecodeが成功し、返される全モーラ区間がPCM範囲内になる。
- [ ] RTC outboundの確認で、このdecode結果を音声queueへ渡しても `codec_error` によるsession closeを
      開始しない。

## 設計判断

補正対象は「最後かつtext / vowelを持たない無音モーラ」に限定する。発話部分や途中のモーラ超過は
container取り違え・欠損・不正timingを隠し得るため補正しない。補正後の区間は既存契約どおり
`StartSample <= EndSample <= len(PCM)` を満たす。

## スコープ境界

対象はPionの合成音声decoderと直接のRTC outbound testである。VoiceSynthesizer / VOICEVOXの
query生成、MessagePack schema、codec、Frontend、staging再デプロイは対象外とする。

## 実装方針

`internal/media/synthdecode/decoder.go` の既存 `mapMora` で、末尾無音だけをPCM末尾へ収める。
新しい設定値や抽象化は追加しない。既存の `DecodeError`、`mora_timing_invalid`、decoder / outbound
test helperを再利用する。

## テスト

`go test ./internal/media/synthdecode ./internal/rtc` を実行する。今回相当の末尾超過と、途中・発話モーラ
超過をそれぞれ1ケースで固定する。

## ドキュメント同期の要否

不要。MessagePack fieldやWebSocket契約は変更せず、consumer内部で既存のPCM範囲内表現へ正規化する。
