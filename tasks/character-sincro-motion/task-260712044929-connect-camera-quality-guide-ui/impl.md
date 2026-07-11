# Implementation Log: task-260712044929-connect-camera-quality-guide-ui

## Completion Summary

- production Pose callback が `camera-quality-changed` を、camera / mode / tracking lifecycle reset が `camera-quality-reset` を AppController event hub へ発火するよう接続した。
- `PanelCameraGuideState` reducer に observed-time clock、500 ms candidate、1,000 ms visible hold、即時 bad / hide、clock regression 抑制を実装した。
- connection page の diagnostics grid 直前へ `CameraQualityGuideCard` を接続し、既存 guide text 一件だけを一般 UI に表示するようにした。
- tracking / app shell の設計文書を同期した。

## Verification

- `cd sincromisor-frontend && npm run build`: PASS
- `cd sincromisor-frontend && npm test -- --run pages/simpleVrm/react/__tests__/panelCameraGuideState.test.tsx app/controller/__tests__/sincroCameraQualityRuntime.test.ts`: PASS（2 files / 8 tests）
- `npm run gate`: PASS（lint / build / 73 test files、504 tests。1 file / 2 tests skipped）

## Not Run

- Playwright 手動表示確認は未実施。純粋 reducer / server-rendered component test と frontend build で表示・抑制契約を固定したため。
- gate の Markdown check を通すため、基点に存在した未整形の task review / impl / acceptance 10件を Prettier で機械整形した。意味内容の変更はない。

## TypeScript Production Comment Audit

| path                                                                                   | symbol or decision                       | kind                     | current comment               | decision | required maintenance knowledge                                                                               | action                                                               | reviewer note                                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------ | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/app/controller/sincroAppTypes.ts`                            | `SincroAppEvent` camera quality payload  | public export / boundary | 統一 event の一般説明のみ     | rewrite  | `observedAtMs` は UI hysteresis の唯一の clock で、consumer が再採時してはならない                           | event union comment に clock contract を追記                         | payload が `CameraQualityScore` と `observedAtMs` を保持し、reset が payload を持たないこと |
| `sincromisor-frontend/src/app/controller/sincroCharacterMotionEventSink.ts`            | Pose発火 / reset lifecycle               | boundary / lifecycle     | observe-only reset の説明のみ | rewrite  | Pose と同じ receive clock を引き継ぐ理由、mode / camera / tracking reset で stale guide を破棄する ownership | `emitCameraQuality` の TSDoc と既存 reset comment / event 発火を同期 | fallback を含む Pose callback が changed を発火し、reset owner が reset を発火すること      |
| `sincromisor-frontend/src/pages/simpleVrm/react/panelCameraGuideState.ts`              | `PanelCameraGuideState`                  | public export            | なし（新規）                  | add      | score / reason code を保持しない一般 UI 境界と event clock contract                                          | TSDoc を追加                                                         | state に raw score が残らないこと                                                           |
| `sincromisor-frontend/src/pages/simpleVrm/react/panelCameraGuideState.ts`              | `reducePanelCameraGuideState` hysteresis | heuristic                | なし（新規）                  | add      | bad 即時、warn candidate、visible hold、候補競合、clock regression 時の維持 / candidate 破棄                 | TSDoc を追加                                                         | 500 / 1000 ms 条件が tests と一致すること                                                   |
| `sincromisor-frontend/src/pages/simpleVrm/react/components/diagnosticsStatusCards.tsx` | `CameraQualityGuideCard`                 | public component         | なし（新規）                  | add      | 文言一件のみを描画し、抑制 / hysteresis や score 解釈は component の責務外                                   | TSDoc を追加                                                         | score / reason code が props / markup に露出しないこと                                      |

## attempt 2

### Evaluation feedback response

- 名目だけだった reset / chat-mode assertion を削除し、`createSimpleVrmPanelRuntimeEventHandlers()` の実際の changed/reset handler で visible guide が消える state test に置換した。
- `sincro` から `chat` への settings diff を `compareDialogGazeSettings()` で作り、production owner の `resetSincroMotionForGazeSettingsChanges()` から production reset emitter を通して `camera-quality-reset` が発火する lifecycle test を追加した。
- settings lifecycle の reset 条件を controller 内の分岐から名前付き owner function へ抽出し、camera device / gaze / talk mode が camera source 境界である理由を契約コメントに残した。

### Verification

- `cd sincromisor-frontend && npm test -- --run pages/simpleVrm/react/__tests__/panelCameraGuideState.test.tsx`: PASS（7 tests）
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS（lint / build / 73 test files、506 tests。1 file / 2 tests skipped）
