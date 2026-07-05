# Review: task-260706031110-motion-debug-viewer-model-size-split

## 判定
APPROVED

Critical / High の blocking 指摘はない。既存コードの file:line、分割責務、公開 import 面の維持、テスト観点、ドキュメント同期不要の理由、TypeScript production code の comment audit 条件はいずれも task.md 内で検証可能に定義されている。

## 指摘事項
なし

## 実装者への申し送り
- `motionDebugViewerModel.ts` は既存 import 元 `./motionDebugViewerModel` の facade として残し、`createMotionDebugViewerSnapshot`、`MOTION_DEBUG_LAYER_KEYS`、`MOTION_DEBUG_VIEWER_MODES` の import path と配列順序を変えないこと。
- production helper をテスト都合だけで export せず、既存 public API の `createMotionDebugViewerSnapshot()` 経由で replay / live fallback、parser invalid、legacy reliability fallback、camera 解決順、metrics、solver sublayer を確認すること。
- comment audit は `documents/rules/coding-ts.md` に従い、symbol / decision 単位で `keep` / `rewrite` / `delete` / `add` の判断を追える形で `impl.md` に残すこと。特に legacy fallback、parser error wrapping、camera privacy decision、metrics augmentation decision は audit 対象から漏らさないこと。
- ドキュメント同期は task.md の前提どおり不要だが、実装中に `MotionDebugApi`、recording log schema、metrics schema、公開 URL、公開挙動へ踏み込んだ場合は、このタスク範囲外として止めるか、task.md の再レビュー対象に戻すこと。
