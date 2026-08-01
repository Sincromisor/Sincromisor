# sincro-rtc タスク一覧

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 7 件）

### open（未完） — 1 件

| タスク                                                                                                                 | タイトル                                                              | 判定    | 依存                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------- | ----------------------------------------------------------- |
| [task-260726211012-pion-phase-2-pipeline-reset-gate-2](./task-260726211012-pion-phase-2-pipeline-reset-gate-2/task.md) | Pion Phase 2のpipeline resetを実装してRTC pipeline Gate 2を成立させる | ❌ FAIL | `task-260726211007-pion-phase-2-pipeline-websocket-clients` |

### done（完了） — 5 件

| タスク                                                                                                                           | タイトル                                                   | 判定    | 依存                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------- | ----------------------------------------------------- |
| [task-260713013305-fix-webrtc-session-lifecycle](./task-260713013305-fix-webrtc-session-lifecycle/task.md)                       | WebRTCセッション管理の停止耐性と音声フレーム処理を修正する | ✅ PASS | —                                                     |
| [task-260713030640-testclient-httpx2](./task-260713030640-testclient-httpx2/task.md)                                             | TestClientをhttpx2へ移行して非推奨警告を解消する           | ✅ PASS | —                                                     |
| [task-260726150803-pion-codec-poc-gate-1](./task-260726150803-pion-codec-poc-gate-1/task.md)                                     | Pion最小PoCでRTC移行経路を確定する                         | ✅ PASS | —                                                     |
| [task-260726211002-pion-phase-2-messagepack-contract](./task-260726211002-pion-phase-2-messagepack-contract/task.md)             | Pion Phase 2のMessagePack互換層を固定する                  | ✅ PASS | `task-260726150803-pion-codec-poc-gate-1`             |
| [task-260726211007-pion-phase-2-pipeline-websocket-clients](./task-260726211007-pion-phase-2-pipeline-websocket-clients/task.md) | Pion Phase 2のGo pipeline WebSocket clientを実装する       | ✅ PASS | `task-260726211002-pion-phase-2-messagepack-contract` |

### superseded（廃止） — 1 件

| タスク                                                                                         | タイトル                                     | 判定    | 依存 |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------- | ------- | ---- |
| [task-260726151514-aiortc-baseline-gate-0](./task-260726151514-aiortc-baseline-gate-0/task.md) | aiortc現行baselineを取得してGate 0を判定する | ❌ FAIL | —    |

<!-- AUTOGEN:tasks END -->
