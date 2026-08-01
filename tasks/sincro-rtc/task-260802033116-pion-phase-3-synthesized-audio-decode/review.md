# Review: task-260802033116-pion-phase-3-synthesized-audio-decode

## 判定

APPROVED

前回のDecoder/CommandRunner/ownerの矛盾とFFmpeg供給整合のHighは解消された。
現行環境のFFmpeg 6.1.1も受理範囲に入り、改訂箇所に実装を止める新たな破綻はない。

## 指摘事項

- [Medium] `CommandRunner.Run` の概念的schemaは確定したが、記載上は `stdin`、`stdoutLimit`、
  `stderrLimit`、`args...` のGo型が省略されている。実装時は、例えばencoded voiceを防御的に渡せる型、
  byte上限をoverflowなく表す型、引数配列を明示し、doc commentとfake/実runnerで同じ契約に揃えること。
  これはinterfaceの役割・入出力・ownerを変える複数案ではなく、実装者が妥当に確定できる単一の型詳細なので
  申し送りで足りる。

## 実装者への申し送り

- `Decoder.Decode`、`NewDecoder`、`CommandRunner.Run`、immutableなDecoderの並行利用、
  `cmd/pion-poc.run`での単一生成、Manager dependency経由のSession保持まで注入経路が確定した。
  package globalへrunner/pathを保持しないこと。
- FFmpeg対応範囲は6.1以上8.x以下となり、現行 `/usr/bin/ffmpeg` 6.1.1で実codec integrationを実行可能になった。
  version下限・上限の境界と範囲外versionがlistener開始前に失敗することをtestすること。
- Sessionは本タスクではDecoder参照だけを保持し、decode呼出しやoutbound pacingを先行実装しないこと。
  後続outbound taskがconstructorやrunner ownershipを再設計しなくてよい境界を維持すること。
- READMEには同じ6.1〜8.x範囲、`--ffmpeg`、確認command、startup failureを同期すること。
- 前回までに確定したschema、MIME、mora丸め、error分類、resource cleanup、comment acceptanceを維持すること。
