# backend タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 23 件）

### open（未完） — 5 件

| タスク                                                                                                           | タイトル                                                | 判定 | 依存                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---- | ------------------------------------------------- |
| [task-261017195943-synthesizer-blocking-work](./task-261017195943-synthesizer-blocking-work/task.md)             | 音声合成の同期処理をイベントループから分離する          | —    | `task-261017195943-voicevox-http-session`         |
| [task-261017195944-nemo-encoded-audio-reuse](./task-261017195944-nemo-encoded-audio-reuse/task.md)               | 確定音声の候補再試行でNeMoのエンコード結果を再利用する  | —    | `task-261017195944-nemo-encode-decode-separation` |
| [task-261017195944-sudachi-tokenizer-reuse](./task-261017195944-sudachi-tokenizer-reuse/task.md)                 | Sudachiの分割モードを生成時に固定し解析領域を再利用する | —    | —                                                 |
| [task-261017195944-synthesizer-model-serialization](./task-261017195944-synthesizer-model-serialization/task.md) | 音声合成モデルの変換をPydanticの標準処理へ集約する      | —    | —                                                 |
| [task-261017195945-nemo-streaming-feasibility](./task-261017195945-nemo-streaming-feasibility/task.md)           | 現行ReazonSpeechでNeMoの逐次認識を利用できるか調査する  | —    | —                                                 |

### done（完了） — 18 件

| タスク                                                                                                             | タイトル                                               | 判定    | 依存                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------ |
| [task-260913042545-extractor-egl](./task-260913042545-extractor-egl/task.md)                                       | 音声区間抽出コンテナの共有ライブラリ不足を修正         | ✅ PASS | —                                                                                    |
| [task-260915031110-mastra-admin-mcp](./task-260915031110-mastra-admin-mcp/task.md)                                 | ローカル管理者のMCP接続をMastraから利用する            | ✅ PASS | `task-260915031110-mastra-studio-session-memory`                                     |
| [task-260915031110-mastra-studio-session-memory](./task-260915031110-mastra-studio-session-memory/task.md)         | Mastra APIとStudio Editorを同梱し会話文脈を隔離する    | ✅ PASS | `task-260915031109-gemma4-llama-server`                                              |
| [task-260915031111-mastra-text-stream-adapter](./task-260915031111-mastra-text-stream-adapter/task.md)             | Mastraの応答を既存のテキスト処理契約へ変換する         | ✅ PASS | `task-260915031110-mastra-studio-session-memory`                                     |
| [task-260915031111-replace-dify-with-mastra](./task-260915031111-replace-dify-with-mastra/task.md)                 | チャット生成をMastraへ切り替えDify依存を撤去する       | ✅ PASS | `task-260915031110-mastra-admin-mcp`, `task-260915031111-mastra-text-stream-adapter` |
| [task-260921171254-agent-server-recovery](./task-260921171254-agent-server-recovery/task.md)                       | AgentServerの再起動・Consul登録・未対応feedbackの修正  | ✅ PASS | —                                                                                    |
| [task-260921173921-extract-agent-definition](./task-260921173921-extract-agent-definition/task.md)                 | エージェント定義と初期プロンプトを分離する             | ✅ PASS | —                                                                                    |
| [task-260921175038-modernize-mastra-storage](./task-260921175038-modernize-mastra-storage/task.md)                 | 非推奨APIの調査とMastra保存領域型の更新                | ✅ PASS | —                                                                                    |
| [task-261011152416-update-python-dependencies](./task-261011152416-update-python-dependencies/task.md)             | Python依存を更新しMediaPipeの厳密固定を解除する        | ✅ PASS | —                                                                                    |
| [task-261011152417-update-agent-server-dependencies](./task-261011152417-update-agent-server-dependencies/task.md) | AgentServerのMastra一式と実行環境を更新する            | ✅ PASS | —                                                                                    |
| [task-261011152417-update-rtc-go-dependencies](./task-261011152417-update-rtc-go-dependencies/task.md)             | RTCのGo依存とGo保守版を更新する                        | ✅ PASS | —                                                                                    |
| [task-261017195943-extractor-serial-executor](./task-261017195943-extractor-serial-executor/task.md)               | MediaPipeの共有分類器を直列実行して受信待ちを分離する  | ✅ PASS | —                                                                                    |
| [task-261017195943-mastra-http-session](./task-261017195943-mastra-http-session/task.md)                           | Mastra向けHTTPセッションを会話接続内で再利用する       | ✅ PASS | —                                                                                    |
| [task-261017195943-recognizer-serial-executor](./task-261017195943-recognizer-serial-executor/task.md)             | 共有NeMoモデルの直列実行を保って認識待ちを分離する     | ✅ PASS | —                                                                                    |
| [task-261017195943-voicevox-http-session](./task-261017195943-voicevox-http-session/task.md)                       | VOICEVOXのHTTP接続を再利用し要求待ちを制限する         | ✅ PASS | —                                                                                    |
| [task-261017195944-extractor-chunk-buffer](./task-261017195944-extractor-chunk-buffer/task.md)                     | 音声区間抽出の受信バッファで繰り返す配列コピーを減らす | ✅ PASS | —                                                                                    |
| [task-261017195944-nemo-encode-decode-separation](./task-261017195944-nemo-encode-decode-separation/task.md)       | NeMo認識を前処理・エンコード・デコードへ分ける         | ✅ PASS | —                                                                                    |
| [task-261017195944-recognizer-growing-buffer](./task-261017195944-recognizer-growing-buffer/task.md)               | 認識用の累積音声を容量付きバッファで保持する           | ✅ PASS | —                                                                                    |

<!-- AUTOGEN:tasks END -->
