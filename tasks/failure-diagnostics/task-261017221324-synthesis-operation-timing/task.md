# 本文設定に依存しない音声合成の段階と時間を記録する

## 背景 / 目的

VoiceCacheManagerは本文記録が無効だと開始ログと所要時間も出さない。VOICEVOXのクエリ作成・音声生成・エンコードも失敗の大分類だけでは遅延箇所を特定しにくい。

優先度: 高。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [Pythonの実ライブラリ例外を診断原因へ分類する](../task-261017221323-python-failure-classification/task.md)

## 担当範囲

- [sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceCacheManager.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceCacheManager.py)
- [sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizer.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizer.py)
- [sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceVox.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceVox.py)
- [sincromisor-server/voice-synthesizer/tests/test_synthesis_logging.py](../../../sincromisor-server/voice-synthesizer/tests/test_synthesis_logging.py)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 通信送信の成功判定、処理性能の改善、エンジン内部の全計測。

## 設計判断

- 内容を持たない処理開始・結果・duration_msは合成ログ設定に依存させない。textと生成条件は既存設定を守る。
- 既存のキャッシュ読書き診断へ所要時間を加え、生成経路はaudio_query、synthesis、encodeの段階を記録する。既存のHTTPプール、音声変換、保存順序を維持する。
- IDは呼出元が実際に保持するものだけをログ用に渡し、msgpackとキャッシュキーへ追加しない。

## 完了条件

- [x] 内容記録の有効・無効とも、処理開始、結果、段階別所要時間、失敗原因を確認できる。
- [x] キャッシュ命中と実生成、クエリ失敗と音声生成失敗を区別でき、無効時に本文・生成条件を出さない。

## 確認方法

- 既存合成ログ試験へ無効設定とHTTP代役の段階別失敗を追加する。時計や代役を使い実GPU・長時間待機なしで確認する。対象pytestと変更PythonのRuffを実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)
- [documents/design/backend/services/voice-synthesizer.md](../../../documents/design/backend/services/voice-synthesizer.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。

## 実施結果

本文設定から独立した開始・結果・ミリ秒単位の所要時間を記録した。既存キャッシュ操作へ時間を加え、実生成をクエリ・WAVと時刻・変換の3段階に分けた。HTTPプール、保存順、通信形式を維持し、会話IDは診断だけへ渡している。

本文・対話設定の組合せ、3段階の失敗、生成とRedis/S3命中をHTTP代役で確認した。対象pytestは24件成功、変更PythonのRuff・整形・ty、Markdown整形、タスク整合が成功した。コメント点検: PASS。実VOICEVOX・実エンコーダーは使わず、HTTPと変換失敗の代役で確認した。
