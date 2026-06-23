# character animation 3.0 motion debug log schema

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の `Phase 1: Motion evaluation harness` は、アルゴリズム改善より先に、同一入力ログで同一 retarget 結果を再現できる評価基盤を作ることを要求している。現行 `motion-debug` は本番経路を使う IK 調整ページとして成立しているが、構造化ログ schema、version 分岐、validation はまだ持っていない。

このタスクでは、後続の recorder / replay / metrics / viewer が共有する `SincroMotionDebugLog` v1 の TypeScript 型と Zod schema を先に固定する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts` を追加し、`SincroMotionDebugLogManifest`、`SincroMotionDebugFrame`、`SincroMotionDebugLogLine`、`SincroMotionDebugLogParseResult` を export する。
- [ ] schema version は文字列 literal `"sincro.motion-debug-log.v1"` とし、NDJSON の 1 行目は `{ "recordType": "manifest", "manifest": ... }`、2 行目以降は `{ "recordType": "frame", "frame": ... }` に固定する。位置だけで manifest / frame を推測する形式は採用しない。
- [ ] manifest には `schemaVersion`、`createdAtIso`、`source`、`environment`、`build`、`camera`、`pipeline`、`avatar`、任意の `metricSummary` を持たせる。`camera.actualSettings.deviceId` と `camera.actualSettings.groupId` は schema 上も raw 文字列を許可せず、`deviceIdHash` / `groupIdHash` または未設定のみ許可する。
- [ ] manifest の最小 shape は本タスクの「設計判断」にある `SincroMotionDebugLogManifest` に固定し、`source.kind` / `camera.actualSettings` / `pipeline` / `avatar` の unknown key 方針も schema に反映する。
- [ ] frame record には `frameIndex`、`timestamp.mediaTimeMs`、`video.width`、`video.height` を必須にし、`mediapipe`、`poseSnapshot`、`reliability`、`canonical`、`temporal`、`intent`、`solver`、`finalPose`、`applied`、`metrics` は v1 では `unknown` を許す optional slot として定義する。後続 replay が読む normalized pose snapshot の field 名は `frame.poseSnapshot` に固定する。
- [ ] `parseMotionDebugLogLines(lines: string[])` は空入力、manifest 欠落、frame が manifest より前に出る入力、未知 `schemaVersion`、負の `frameIndex`、必須 timestamp 欠落を deterministic な error code で返す。例外をそのまま UI へ投げない。
- [ ] `SincroMotionDebugLogParseResult` は本タスクの「設計判断」にある discriminated union に固定し、error code は `empty_input`、`invalid_json`、`missing_manifest`、`frame_before_manifest`、`unknown_schema_version`、`invalid_frame_index`、`missing_timestamp`、`invalid_record` を最低限含める。
- [ ] `sincromisor-frontend/src/character/motionEvaluation/__tests__/motionDebugLogSchema.test.ts` を追加し、valid log、空入力、manifest 欠落、raw `deviceId` 混入、未知 schema version、frame index 境界を Vitest で検証する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に schema version、保存単位、`frame.poseSnapshot`、raw camera identifier を保存しない方針を同期する。

## 設計判断（着手前に確定済み）

- 新規共有モジュールは `src/character/motionEvaluation/` に置く。`pages/motionDebug` は UI 専用、`features/gaze` は tracking 入力専用に留め、評価ログは character motion の横断基盤として扱うため。
- schema validation は既存依存の `zod` を使う。`sincromisor-frontend/package.json:40` から `zod` は runtime dependency にあり、`src/features/rtc/rtcBoundarySchema.ts:1` でも境界 schema に使われているため、新規 validation ライブラリは追加しない。
- NDJSON + gzip/Brotli のうち、このタスクは NDJSON の line schema と parser までを責務にする。圧縮・download・import は後続 `task-260623221629-character-animation-3-motion-debug-recorder-export` で扱う。
- MediaPipe raw result / reliability / canonical / temporal / intent / solver / pose の詳細型は v1 では optional `unknown` slot に閉じる。Phase 2 以降の canonical contract 未確定部分を、この Phase 1 schema タスクで先取りして大きくしないため。
- camera 識別子は raw 保存禁止にする。`deviceIdHash` / `groupIdHash` は deterministic hash 済み文字列だけ許し、hash 方式は recorder タスクで実装する。

最小 manifest shape:

```ts
type SincroMotionDebugLogManifest = {
    schemaVersion: "sincro.motion-debug-log.v1";
    createdAtIso: string;
    source: {
        kind: "live-camera" | "video-fixture" | "synthetic";
        fixtureId?: string;
        videoHash?: string;
    };
    environment: {
        userAgent: string;
        devicePixelRatio: number;
        viewport: { width: number; height: number };
        timeOriginMs?: number;
    };
    build: {
        appVersion?: string;
        gitCommit?: string;
        packageVersions: Record<string, string | undefined>;
        configHash: string;
    };
    camera: {
        requestedConstraints?: unknown;
        actualSettings?: {
            width?: number;
            height?: number;
            frameRate?: number;
            facingMode?: string;
            deviceIdHash?: string;
            groupIdHash?: string;
        };
    };
    pipeline: Record<string, unknown>;
    avatar: {
        avatarProfileId: string;
        vrmMetaHash?: string;
        boneCapabilities: Record<string, boolean>;
        restMetrics?: Record<string, unknown>;
        motionProfile?: Record<string, unknown>;
    };
    metricSummary?: unknown;
};
```

`camera.actualSettings` は上記 key のみ許可し、`deviceId` / `groupId` は unknown key としても拒否する。`pipeline` は Phase 1 では `Record<string, unknown>` を許すが、manifest 上の top-level key は上記以外を拒否する。

parse result shape:

```ts
type SincroMotionDebugLogParseErrorCode =
    | "empty_input"
    | "invalid_json"
    | "missing_manifest"
    | "frame_before_manifest"
    | "unknown_schema_version"
    | "invalid_frame_index"
    | "missing_timestamp"
    | "invalid_record";

type SincroMotionDebugLogParseError = {
    code: SincroMotionDebugLogParseErrorCode;
    lineIndex: number | null;
    message: string;
};

type SincroMotionDebugLogParseResult =
    | { ok: true; manifest: SincroMotionDebugLogManifest; frames: SincroMotionDebugFrame[] }
    | { ok: false; errors: SincroMotionDebugLogParseError[] };
```

## スコープ境界

- 本タスクでやること:
    - log manifest / frame / line の型定義。
    - Zod による v1 schema validation。
    - NDJSON line 配列から manifest と frames を読む parser。
    - schema のユニットテスト。
- 本タスクでやらないこと:
    - `motion-debug` UI への record / export ボタン追加。
    - gzip / Brotli 圧縮と file download。
    - replay 実行、metrics 計算、baseline / candidate 比較。
    - `CanonicalUpperBodyState` の詳細 contract 定義。これは Phase 2 の責務。

## 実装方針（既存コード整合: file:line）

- 現行 `motion-debug` の snapshot は `MotionDebugSnapshot` に `camera`、`pose`、`tracker`、`poseRetarget`、`poseRetargetRuntime`、`render` を持つ（`sincromisor-frontend/src/pages/motionDebug/types.ts:23`）。本タスクの schema はこの snapshot を直接置き換えず、後続 recorder が保存する file format として追加する。
- `MotionDebugApp.getSnapshot()` は Debug Console の `sincroMotion` snapshot と camera state を合成している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:164`）。log frame の `solver` / `finalPose` slot は、後続でこの runtime snapshot を取り込めるよう optional にする。
- `SincroPoseMotionSnapshot` は pose tracking の既存内部 snapshot であり、confidence、arms、lowerBodyTargets、inference timing を含む（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:79`）。v1 schema では `mediapipe` raw と `pose snapshot` を混同せず、frame slot 名を分ける。
- `SincroPoseRetargetFrame` は retarget 後の upper body / arm / IK constraint snapshot を含む（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:24`）。v1 の `solver` slot はこの値を保存可能にするが、型を直接結合して Phase 2 以降の変更を阻害しない。
- `documents/design/frontend/character/motion.md:48` は `motion-debug` を本番経路を使う IK 調整ページと定義している。本タスクでは設計文書に「評価ログ schema は `src/character/motionEvaluation` の責務」と追記する。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugLogSchema`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`
- 可能なら最終確認で `npm run gate` を実行する。時間や環境制約で省く場合は `impl.md` に理由を残す。

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer 向け debug log file format という公開挙動を追加するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に schema version、保存単位、raw camera identifier を保存しない方針を同期する。
