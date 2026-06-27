# character animation 3.0 phase 9 semantic pose layer composer bridge

## 背景 / 目的

Phase 9 は semantic clip を全身上書きではなく tracking pose への additive / partial override として扱い、Three.js `AnimationMixer` や authored clip を staging 用に使う場合も最終的には pose delta として `VrmPoseComposer` に渡すことを要求している（`documents/research/character_animation/roadmap.md:484`、`documents/research/character_animation/roadmap.md:485`）。motion design 調査も tracking pose、semantic additive clip、fallback / comfort pose を `VrmPoseComposer` で合成する方針を示している（`documents/research/character_animation/answers/04-character-motion-design.md:181`、`documents/research/character_animation/answers/04-character-motion-design.md:210`）。

このタスクでは、依存タスクの `MotionIntentState` を `VrmPoseLayer` に変換する `SemanticMotionPoseLayer` を追加し、既存 `VrmPoseComposer` へ semantic layer を渡せる contract を作る。実際の本番 `VRMCharacterManager.update()` の書き込み順序は変更せず、motion-debug / helper から同じ input で composer result を観測できる developer-only bridge に留める。

## 完了条件（受け入れ条件）

- [ ] 依存タスク `task-260627180718-character-animation-3-0-phase-9-gesture-intent-estimator-hys` の `MotionIntentState` / estimator が HEAD に存在しない場合は実装せず、依存未充足として止める。
- [ ] `sincromisor-frontend/src/character/motionIntent/semanticMotionPoseLayer.ts` を追加し、`createSemanticMotionPoseLayer(input)`、`SemanticMotionPoseLayerInput`、`SemanticMotionPosePresetId`、`SemanticMotionPoseLayerDebugSnapshot` を export する。
- [ ] `VrmPoseLayerKind` に `"semantic"` を追加し、composer order を `fallback -> tracking -> semantic -> idle -> style` に固定する。`semantic` は tracking の後、idle / style の前に合成し、tracking が所有している同一 arm bone は layer metadata の confidence と ownership rule で衝突を警告する。
- [ ] `VrmPoseLayer` に optional `metadata` を追加し、v1 では semantic confidence だけを composer が読む。metadata が無い semantic layer は confidence `0` とみなし、tracking conflict 時は suppress する。

```ts
export type VrmPoseLayer = {
    id: string;
    kind: VrmPoseLayerKind;
    blendMode: VrmPoseBlendMode;
    weight: number;
    pose: VrmNormalizedLocalPose;
    ownedBones: VRMHumanBoneName[];
    metadata?: {
        semantic?: {
            side?: "left" | "right" | "both";
            intent: ArmMotionIntent;
            intentConfidence: number;
            conflictSuppressionThreshold: number; // default 0.65
        };
    };
};
```

- [ ] `VrmPoseComposerResult.suppressedLayers[].reason` に `"semantic_conflict"` を追加する。semantic layer が tracking layer と同じ upperArm / lowerArm / hand bone を override しようとし、intent confidence `< 0.65` の場合は該当 bone を suppress し、`semantic_conflict` を保存する。
- [ ] `createSemanticMotionPoseLayer()` の入力は `MotionIntentState`、`AvatarMotionProfile`、optional previous semantic snapshot、`deltaSeconds` に限定する。Temporal / Hand / raw gesture / MediaPipe raw landmark は読まない。
- [ ] `createSemanticMotionPoseLayer()` の return shape は次に固定する。semantic を出さない場合も `layers: []` と valid debug snapshot を返す。`debug.schemaVersion` は `"sincro.phase9-semantic-motion.v1"` に固定する。

```ts
export type SemanticMotionPoseLayerInput = {
    intent: MotionIntentState;
    profile: AvatarMotionProfile;
    previous?: SemanticMotionPoseLayerDebugSnapshot;
    deltaSeconds?: number;
};

export type SemanticMotionPoseLayerDebugSnapshot = {
    schemaVersion: "sincro.phase9-semantic-motion.v1";
    timestamp: { mediaTimeMs: number };
    presets: Array<{
        side: "left" | "right" | "both";
        intent: ArmMotionIntent;
        presetId: SemanticMotionPosePresetId | "none";
        layerId?: string;
        weights: { arm: number; wrist: number; fingers: number; layer: number };
        ownedBones: VRMHumanBoneName[];
        suppressedBones: VRMHumanBoneName[];
        warnings: string[];
    }>;
    warnings: string[];
};

export type SemanticMotionPoseLayerResult = {
    layers: VrmPoseLayer[];
    debug: SemanticMotionPoseLayerDebugSnapshot;
};
```

- [ ] semantic preset は v1 で `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`soft_clap_like`、`lost_to_comfort` に固定する。preset id は debug snapshot に保存し、AnimationMixer clip 名や external asset path は保存しない。
- [ ] intent -> preset mapping は次に固定する。`tracking` は no-op で `presetId: "none"`、`guarded` は no-op で warning `guarded_semantic_pose_deferred`、`lost` / `fallback` は `lost_to_comfort`、`wave` は `small_wave`、`pointing` は `point_forward_or_up`、`thumbsUp` は `thumbs_up_hold`、`peace` は `peace_hold`、`nearFace` は `shy_hand_near_face`、`explain` は `explain_open_palm`、`clapLike` は左右両方が `clapLike` の場合だけ `side: "both"` の `soft_clap_like` を 1 layer 返し、片側だけの場合は no-op warning `clap_like_requires_both_hands` にする。
- [ ] layer weight は `intent.confidence * intent.expressiveness * profile.fingers.curlScale` ではなく、arm / wrist / fingers 別の weight を debug snapshot に持つ。v1 の pose layer 自体の `weight` は max part weight を `0..1` clamp した値に固定する。
- [ ] 片腕 semantic は side ごとに最大 1 layer を返し、layer id は `semantic:<side>:<presetId>` に固定する。左右同時に別 intent がある場合は左右それぞれ 1 layer ずつ返す。`clapLike` の both layer は左右単独 layer より優先し、左右の clapLike confidence の小さい方を `intentConfidence` として metadata に入れる。
- [ ] semantic pose は upperArm / lowerArm / hand / wrist 相当の `VRMHumanBoneName` keyed quaternion だけを出力し、spine / chest / head / expression は v1 では出力しない。`clapLike` で両腕を扱う場合も torso を直接上書きしない。
- [ ] `wave` は hand / lowerArm / wrist の小さな additive arc に限定し、shoulder / chest へ大きな override を入れない。`pointing`、`thumbsUp`、`peace`、`nearFace` は hold pose の partial override とし、tracking の shoulder / upperArm 大枠を残す。
- [ ] `lost` / `fallback` は comfort pose layer として `fallback` kind ではなく `semantic` kind で返す。既存 fallback layer と競合する場合は composer order に従い、debug warning `semantic_fallback_active` を残す。
- [ ] composer は `semantic` kind を unknown として落とさず、zero weight、missing optional bone、quaternion normalize、angular velocity clamp が既存 layer と同じ規則で働く。
- [ ] `semanticMotionPoseLayer.test.ts` と `vrmPoseComposer.test.ts` を追加 / 更新し、semantic order、tracking conflict suppression、zero weight suppression、missing optional hand bone suppression、wave が torso を所有しないこと、lost_to_comfort が full body overwrite しないことを検証する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に `semantic` layer、preset id、partial override、AnimationMixer を staging に留める方針を同期する。

## 設計判断（着手前に確定済み）

- `semantic` は `VrmPoseLayerKind` に追加する。`idle` や `style` に流用する案は、意図表現と常時 micro motion の責務が混ざり debug で切り分けにくいため採用しない。
- v1 は authored asset / AnimationMixer を使わず、code-defined quaternion preset から `VrmPoseLayer` を作る。外部 clip のロードや timeline 再生は、pose delta contract が固まった後に追加する。
- semantic layer は `AvatarMotionProfile` を読むが、保存 snapshot には profile 全体を複製しない。profile は Phase 7 snapshot の責務であり、semantic debug には preset id、weight、ownedBones、warnings だけを残す。
- spine / chest / head は v1 semantic の対象外にする。Phase 6 / Phase 7 で torso/head の所有境界がまだ全面移行前であり、Phase 9 では手先 / wrist / lowerArm の意図表現に絞る。
- 本番 update 順序は変更しない。Phase 6 の composer task と同じ developer-only bridge として motion-debug / tests で検証し、全面移行は別タスクに残す。

## スコープ境界

- 本タスクでやること:
    - `semantic` pose layer kind。
    - MotionIntent から semantic `VrmPoseLayer` を作る helper。
    - composer の semantic layer order / suppression / debug。
    - semantic pose unit test。
- 本タスクでやらないこと:
    - Finger chain 全体の curl mapping。後続 finger task に残す。
    - Gesture Recognizer 実行。
    - motion-debug recording への semantic snapshot 保存。
    - 本番 VRM bone 書き込みの全面 composer 移行。
    - authored clip asset の作成 / AnimationMixer 接続。
- 依存タスクとの境界:
    - gesture estimator task は `MotionIntentState` を出力するだけ。
    - 本タスクは `MotionIntentState` を `VrmPoseLayer` に変換するだけ。
    - debug/replay integration task が live recording / viewer / docs を接続する。

## 実装方針（既存コード整合: file:line）

- `VrmPoseLayerKind` は現在 `"fallback" | "tracking" | "idle" | "style"` である（`sincromisor-frontend/src/character/vrmPose/vrmPoseTypes.ts:13`）。ここに `"semantic"` を追加する。
- `composeVrmPose()` は `LAYER_ORDER` に従って layers を処理している（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:28`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:52`）。semantic order はこの配列で固定する。
- composer は layer の `ownedBones` と `pose` から write を作り、unsupported / missing optional bone を warning / suppression にしている（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:100`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:122`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:126`）。semantic も同じ処理に乗せる。
- 現在の tracking ownership suppression は idle / style にだけ効く（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:235`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:240`）。semantic は intent confidence に応じた別 reason `semantic_conflict` を追加する。
- `AvatarMotionProfile` は wrist / fingers / arm の default scale を持つ（`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:95`、`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:103`、`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:108`）。semantic helper は完成版 profile を読み、minimal profile へ暗黙変換しない。

## テスト

- `cd sincromisor-frontend && npm run test -- semanticMotionPoseLayer`
- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な `VrmPoseLayerKind` と composer layer order を変更するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に `semantic` layer、preset id、partial override、AnimationMixer を staging に留める方針を同期する。
