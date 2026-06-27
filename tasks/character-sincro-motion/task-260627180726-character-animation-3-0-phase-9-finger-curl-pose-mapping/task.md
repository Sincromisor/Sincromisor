# character animation 3.0 phase 9 finger curl pose mapping

## 背景 / 目的

Phase 9 は指制御を各関節 3D rotation から始めず、`open / half / closed` と親指、人差し指、中指、薬指小指グループの curl へ段階的に拡張する方針を定めている（`documents/research/character_animation/roadmap.md:483`）。VRM / three-vrm 調査も、指は `curl`、限定的な `spread`、thumb `oppose` の低次元パラメータに落とし、存在する bone だけを使って fallback することを推奨している（`documents/research/character_animation/answers/05-vrm-three-vrm.md:247`、`documents/research/character_animation/answers/05-vrm-three-vrm.md:256`）。Phase 8 の Hand snapshot はすでに finger curl / splay / thumb oppose / openness を保存している（`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:18`、`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:33`）。

このタスクでは、Hand snapshot と MotionIntent から finger curl 用の `VrmPoseLayer` を作る helper を追加する。semantic pose layer とは別に finger bone mapping を小さく切り出し、VRM optional finger chain が欠損しても例外停止せず、存在する bone だけを `VrmPoseComposer` に渡せるようにする。

## 完了条件（受け入れ条件）

- [ ] 依存タスク `task-260627180722-character-animation-3-0-phase-9-semantic-pose-layer-composer` の `semantic` layer kind が HEAD に存在しない場合は実装せず、依存未充足として止める。
- [ ] `sincromisor-frontend/src/character/motionIntent/fingerCurlPoseLayer.ts` を追加し、`createFingerCurlPoseLayer(input)`、`createFingerCurlPoseLayers(input)`、`FingerCurlPoseLayerInput`、`FingerCurlGroupState`、`FingerCurlPoseDebugSnapshot`、`FingerCurlPoseLayerResult` を export する。
- [ ] `createFingerCurlPoseLayer(input)` は side 1 本分の layer を返し、`createFingerCurlPoseLayers(input)` は left / right の helper を順に呼んで `layers` と `debug` をまとめる convenience helper にする。単体実装の正本は side 指定の `createFingerCurlPoseLayer(input)` とする。
- [ ] input / return shape は次に固定する。`mediaTimeMs` は previous curl 保持の時刻基準であり、`SincroHandMotionSnapshot.lastUpdatedAtMs` には依存しない。

```ts
export type FingerCurlPoseLayerInput = {
    side: "left" | "right";
    hand: SincroHandMotionSnapshot;
    intent: MotionIntentState;
    profile: AvatarMotionProfile;
    mediaTimeMs: number;
    previous?: FingerCurlPoseDebugSnapshot;
};

export type FingerCurlGroupState = {
    group: "thumb" | "index" | "middle" | "ringLittle";
    curl: number;
    source: "hand" | "openness" | "intent" | "previous" | "default";
    warnings: string[];
};

export type FingerCurlPoseDebugSnapshot = {
    schemaVersion: "sincro.phase9-finger-curl-pose.v1";
    side: "left" | "right";
    timestamp: { mediaTimeMs: number };
    groups: FingerCurlGroupState[];
    ownedBones: VRMHumanBoneName[];
    warnings: string[];
};

export type FingerCurlPoseLayerResult = {
    layer?: VrmPoseLayer;
    debug: FingerCurlPoseDebugSnapshot;
};
```

- [ ] input は `SincroHandMotionSnapshot`、`MotionIntentState`、`AvatarMotionProfile`、caller 指定 `mediaTimeMs`、optional previous debug snapshot に限定する。Hand raw landmarks、MediaPipe Gesture Recognizer result、VRM Object3D、raw bone node は読まない。
- [ ] finger group は `thumb`、`index`、`middle`、`ringLittle` に固定する。`ring` と `little` は同じ group weight を使い、v1 では個別 semantic を作らない。
- [ ] `openness` fallback は `"open" -> curl 0.0`、`"half" -> curl 0.55`、`"closed" -> curl 1.0`、`"unknown" -> previous.timestamp.mediaTimeMs から mediaTimeMs までの差が 250ms 以下なら previous group curl を保持、previous 欠損 / dt < 0 / dt > 250ms なら 0.0` に固定する。`features.fingerCurl` が finite な場合は各 group の主値として使い、`openness` は欠損時だけ使う。
- [ ] intent override は `pointing` で index `<= 0.15`、middle/ringLittle `>= 0.75`、thumb `>= 0.35`、`thumbsUp` で thumb `<= 0.20` かつ他指 `>= 0.80`、`peace` で index/middle `<= 0.15` かつ ringLittle `>= 0.75`、`wave` / `explain` で all fingers `<= 0.35` に固定する。tracking intent では Hand snapshot の curl を優先する。
- [ ] curl は `AvatarMotionProfile.fingers.curlScale` を掛け、最終 `0..1` に clamp する。`curlMode` が `"grouped"` の場合も `"perFinger"` の場合も v1 は group input を使い、per-finger raw landmark rotation は作らない。
- [ ] curl distribution は `AvatarMotionProfile.fingers.curlDistribution` を正本にし、proximal / intermediate / distal の合計が `1.0 ± 0.001` から外れる場合は default `{ proximal: 0.5, intermediate: 0.3, distal: 0.2 }` に戻し warning `invalid_finger_curl_distribution_profile_defaulted` を残す。
- [ ] `AvatarMotionProfile.capabilities.fingerChains` を読み、欠損 bone は `ownedBones` に含めない。distribution は available bone の元 weight だけを合計して正規化する。proximal+intermediate では distal 分を残り 2 bone の比率で再配分し、proximal+distal / intermediate+distal でも同じ正規化規則を使う。proximal only の chain は curl 全量を proximal に入れるが angle limit を通常の `0.65x` に下げる。全部欠損した finger group は warning `missing_finger_chain:<side>:<group>` を残し、throw しない。
- [ ] 出力 layer は `kind: "semantic"`、`blendMode: "additive"`、`id: "finger-curl:<side>"` とし、finger bones だけを `ownedBones` に含める。upperArm / lowerArm / hand / torso / head は所有しない。
- [ ] angle は v1 で curl max `70deg`、thumb oppose max `22deg`、splay max は profile `splayLimitDeg` に固定する。curl は local `+X` axis に `-angle` を入れ、左右で符号反転しない。splay は local `+Z` axis に left は `+angle`、right は `-angle` を入れる。thumb oppose は local `+Y` axis に left は `+angle`、right は `-angle` を入れる。
- [ ] quaternion 合成順は `curl -> splay -> thumbOppose` に固定し、実装では `final = oppose * splay * curl` の順で適用する。thumb oppose は thumb group の最初に存在する chain bone だけに入れ、index / middle / ring / little には入れない。quaternion は plain `{ x, y, z, w }` として保存し、`THREE.Quaternion` instance は layer / debug snapshot に残さない。
- [ ] `fingerCurlPoseLayer.test.ts` で openness fallback、intent override、profile curlScale、invalid distribution default、missing distal redistribution、missing whole group warning、layer が finger bone 以外を所有しないことを検証する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に finger group、curl distribution、optional bone fallback、axis / sign、raw landmark rotation を扱わない方針を同期する。

## 設計判断（着手前に確定済み）

- finger mapping は `motionIntent` 配下に置く。入力が Hand snapshot と MotionIntent であり、IK solver ではなく semantic pose layer の一部だから。
- ring / little は v1 では group 化する。単眼 Hand Landmarker で個別小指の安定性を前提にしないため。
- `openness` は欠損 fallback に限定し、finite な `fingerCurl` がある場合はそちらを優先する。Phase 8 Hand snapshot の低次元 feature を活かしつつ、`open / half / closed` の単純制御へ退化できるようにする。
- finger layer は `semantic` additive とする。tracking layer に finger を混ぜる案は、intent override と Hand tracking の責務が混ざり debug で見分けにくいため採用しない。
- raw VRM bone node や glTF node 名は使わない。`AvatarMotionProfile.capabilities.fingerChains` と `VRMHumanBoneName` だけを使う。

## スコープ境界

- 本タスクでやること:
    - Hand low-dimensional feature から finger semantic layer を作る helper。
    - AvatarMotionProfile finger chain fallback。
    - finger pose unit test。
- 本タスクでやらないこと:
    - HandLandmarker feature 抽出の変更。
    - Gesture Recognizer 実行。
    - authored clip / AnimationMixer。
    - 本番 character update への接続。
    - finger metrics regression。
- 依存タスクとの境界:
    - semantic pose layer task が `semantic` layer kind と composer bridge を提供する。
    - 本タスクは semantic layer 内の finger 専用 pose 生成だけを扱う。
    - debug/replay integration task が live recording / viewer / docs に保存する。

## 実装方針（既存コード整合: file:line）

- Hand snapshot は `fingerCurl`、`fingerSplay`、`thumbOppose`、`openness` を持つ（`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:21`、`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:28`、`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:33`、`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:34`）。
- AvatarMotionProfile は finger chain capability と finger defaults を持つ（`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:68`、`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:108`、`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:166`）。
- AvatarMotionProfile clone は `fingers.curlDistribution` と `splayLimitDeg` を保持する（`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:288`、`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:291`、`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:292`）。helper は clone 済み profile を直接変更しない。
- VrmPoseLayer は `ownedBones` と `pose` を plain object として composer に渡す（`sincromisor-frontend/src/character/vrmPose/vrmPoseTypes.ts:17`、`sincromisor-frontend/src/character/vrmPose/vrmPoseTypes.ts:22`、`sincromisor-frontend/src/character/vrmPose/vrmPoseTypes.ts:23`）。
- composer は missing optional bone を suppression として扱う（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:126`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:127`）。finger helper 側も欠損 bone を throw せず debug warning にする。

## テスト

- `cd sincromisor-frontend && npm run test -- fingerCurlPoseLayer`
- `cd sincromisor-frontend && npm run test -- semanticMotionPoseLayer`
- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な finger low-dimensional mapping と AvatarMotionProfile finger fallback を追加するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に finger group、curl distribution、optional bone fallback、raw landmark rotation を扱わない方針を同期する。
