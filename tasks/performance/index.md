# performance タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 13 件）

### blocked（停止中） — 2 件

| タスク                                                                                                     | タイトル                                              | 判定    | 依存                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| [task-261101110037-dialogue-endpoint-evaluation](./task-261101110037-dialogue-endpoint-evaluation/task.md) | MediaPipeの入力窓と対話の発話終端の評価基準を確定する | —       | —                                                                                  |
| [task-261107202017-smart-turn-quality](./task-261107202017-smart-turn-quality/task.md)                     | 発話終端の実音声比較と採用基準を整備する              | ❌ FAIL | `task-261107202016-server-smart-turn`, `task-261107202016-server-owned-voice-gate` |

### done（完了） — 11 件

| タスク                                                                                                       | タイトル                                       | 判定    | 依存                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| [task-261031225651-voice-pipeline-audit](./task-261031225651-voice-pipeline-audit/task.md)                   | 音声対話の全経路を調査し改善根拠を整理する     | ✅ PASS | —                                                                                            |
| [task-261031225710-extractor-buffer-boundary](./task-261031225710-extractor-buffer-boundary/task.md)         | 音声区間抽出の余分な入力待ちを解消する         | ✅ PASS | —                                                                                            |
| [task-261031225901-processor-confirmed-only](./task-261031225901-processor-confirmed-only/task.md)           | 暫定認識による不要な履歴転送と保持を除く       | ✅ PASS | —                                                                                            |
| [task-261031230232-streaming-cache-promotion](./task-261031230232-streaming-cache-promotion/task.md)         | 逐次音声合成のS3命中をRedisへ昇格する          | ✅ PASS | —                                                                                            |
| [task-261031230300-recognizer-queue-timing](./task-261031230300-recognizer-queue-timing/task.md)             | 音声認識の待機と実行時間を分離して記録する     | ✅ PASS | —                                                                                            |
| [task-261031230300-rtc-output-scratch](./task-261031230300-rtc-output-scratch/task.md)                       | RTC出力フレームの反復確保を減らす              | ✅ PASS | —                                                                                            |
| [task-261101110037-recognizer-partial-coalescing](./task-261101110037-recognizer-partial-coalescing/task.md) | 音声を欠落させず暫定認識の重複推論を減らす     | ✅ PASS | —                                                                                            |
| [task-261101110038-recognition-storage-isolation](./task-261101110038-recognition-storage-isolation/task.md) | 認識結果の返却と音声記録の保存を分離する       | ✅ PASS | —                                                                                            |
| [task-261101110038-speech-phrase-pacing](./task-261101110038-speech-phrase-pacing/task.md)                   | 読み上げの自然さを保つ応答分割と無音配置にする | ✅ PASS | `task-261101110038-streaming-start-alignment`, `task-261101110038-synthesis-cache-isolation` |
| [task-261101110038-streaming-start-alignment](./task-261101110038-streaming-start-alignment/task.md)         | 逐次音声の先頭区間と再生開始条件を整合する     | ✅ PASS | —                                                                                            |
| [task-261101110038-synthesis-cache-isolation](./task-261101110038-synthesis-cache-isolation/task.md)         | 合成音声の配信とキャッシュ保存の待機を分離する | ✅ PASS | —                                                                                            |

<!-- AUTOGEN:tasks END -->
