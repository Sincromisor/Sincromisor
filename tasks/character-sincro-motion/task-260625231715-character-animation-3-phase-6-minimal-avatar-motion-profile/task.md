# character animation 3.0 phase 6 minimal avatar motion profile

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の Phase 6 は、IK target の scale / depth / reach を決めるため、完成版 `AvatarMotionProfile` より前に `MinimalAvatarMotionProfile` を用意することを求めている。

現行の腕 IK は `SincroArmIkSolver.fromVrm()` が VRM から腕長と肩幅を測り、`SincroPoseRetargeter.attachVrm()` が左右 solver を保持する構成である。一方で、optional bone capability、depth compression、shoulder damping、wrist roll influence などは solver / retarget config に散っており、Phase 6 以降の MotionSolver / VrmPoseComposer が共有して読める avatar-local profile contract がない。

このタスクでは VRM load 時に計測できる最小 profile を追加し、既存 IK の挙動を大きく変えずに後続タスクが参照できる contract を作る。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts` を追加し、`MinimalAvatarMotionProfile`、`AvatarOptionalBoneCapabilities`、`createMinimalAvatarMotionProfile(vrm)` を export する。
- [ ] `MinimalAvatarMotionProfile` は `schemaVersion: "sincro.minimal-avatar-motion-profile.v1"`、`optionalBones`、`measurements`、`solverDefaults`、`warnings` を持つ plain object とする。`THREE.Vector3`、`THREE.Quaternion`、`Object3D`、`VRM` instance は保持しない。
- [ ] `measurements` は `shoulderWidth`、`leftUpperArmLength`、`leftLowerArmLength`、`rightUpperArmLength`、`rightLowerArmLength`、`headSize` を number で持つ。計測不能な値は `undefined` にし、`NaN` / `Infinity` を保存しない。
- [ ] `optionalBones` は `upperChest`、`leftShoulder`、`rightShoulder`、`leftHand`、`rightHand`、`leftThumbProximal`、`rightThumbProximal`、`leftIndexProximal`、`rightIndexProximal` の boolean capability を持つ。
- [ ] `solverDefaults` は `defaultReachScale`、`depthCompression`、`lateralScale`、`verticalScale`、`shoulderDamping`、`wristRollInfluence` を持つ。既定値はそれぞれ `1.0`、`0.55`、`1.0`、`0.92`、`0.65`、`0.25` に固定する。
- [ ] `SincroPoseRetargeter.attachVrm(vrm)` は profile を生成して保持し、Debug Console / motion-debug から後続タスクが読める getter または snapshot field を追加する。ただし本タスクでは retarget / IK の計算結果を profile で変更しない。
- [ ] `SincroArmIkSolver.fromVrm(vrm, side)` またはその周辺 helper は、既存の腕長 / 肩幅計測結果と profile 計測値が同じ VRM から導出されるようにする。計測重複を許す場合も、値の丸め規則と fallback は同一にする。
- [ ] upperChest、shoulder、hand、finger が欠ける VRM でも `createMinimalAvatarMotionProfile(vrm)` は throw せず、該当 capability を `false`、計測不能 field を `undefined`、`warnings` に reason code を残す。
- [ ] `sincromisor-frontend/src/character/avatarProfile/__tests__/minimalAvatarMotionProfile.test.ts` を追加し、全 bone あり、upperChest なし、片側 finger 欠落、腕長計測不能の境界を検証する。
- [ ] `documents/design/frontend/character/motion.md` に `MinimalAvatarMotionProfile` v1 の責務、schema、Phase 6 では計算変更せず後続タスクの入力にする判断を同期する。

## 設計判断（着手前に確定済み）

- 新規 module は `src/character/avatarProfile/` に置く。`src/character/ik/` に置く案は、profile が IK だけでなく VrmPoseComposer / optional bone fallback / Phase 7 calibration にも使われるため採用しない。
- 最小 schema は次に固定する。

```ts
export type MinimalAvatarMotionProfile = {
    schemaVersion: "sincro.minimal-avatar-motion-profile.v1";
    optionalBones: {
        upperChest: boolean;
        leftShoulder: boolean;
        rightShoulder: boolean;
        leftHand: boolean;
        rightHand: boolean;
        leftThumbProximal: boolean;
        rightThumbProximal: boolean;
        leftIndexProximal: boolean;
        rightIndexProximal: boolean;
    };
    measurements: {
        shoulderWidth?: number;
        leftUpperArmLength?: number;
        leftLowerArmLength?: number;
        rightUpperArmLength?: number;
        rightLowerArmLength?: number;
        headSize?: number;
    };
    solverDefaults: {
        defaultReachScale: number;
        depthCompression: number;
        lateralScale: number;
        verticalScale: number;
        shoulderDamping: number;
        wristRollInfluence: number;
    };
    warnings: string[];
};
```

- `VRMHumanBoneName` で `vrm.humanoid.getNormalizedBoneNode()` を参照する。glTF node 名、raw skeleton traversal、モデル固有名への依存は採用しない。
- 計測単位は three-vrm normalized bone node の world space distance を meter 相当の number として保存する。保存時に `Vector3` は捨て、後続には scalar のみ渡す。
- head size は `head` bone と `neck` bone があれば距離、無ければ `shoulderWidth * 0.75` を fallback とし、その場合 `warnings` に `head_size_estimated_from_shoulder_width` を入れる。
- 本タスクでは `AvatarMotionProfile` 完成版、user calibration、online calibration、モデル別 UI は作らない。Phase 7 の責務として残す。
- 外部境界は VRM runtime の bone mapping のみである。VRM が未ロードまたは humanoid mapping が不足する場合は throw せず、warnings 付き profile を返す。

## スコープ境界

- 本タスクでやること:
    - `MinimalAvatarMotionProfile` v1 型と pure-ish factory。
    - VRM load / retargeter attach 時の profile 生成と保持。
    - missing optional bone の capability / warning 化。
    - profile contract の単体テストと設計文書同期。
- 本タスクでやらないこと:
    - IK target 変換式、pole state、constraint、pose composer の変更。
    - `AvatarMotionProfile` 完成版や calibration UX。
    - motion metrics key の追加。
    - VRM 表示や本番 controller の bone 書き込み経路の変更。
- 依存タスクとの境界:
    - Phase 1〜5 の canonical / reliability / temporal state は入力 contract として既存のまま使う。本タスクは temporal state を読まない。
    - 後続の `temporal arm solver bridge` が profile の scale / compression を使い始める。本タスクは profile を作るだけで挙動変更を避ける。

## 実装方針（既存コード整合: file:line）

- `SincroArmIkSolver` は `fromVrm(vrm, side)` で skeleton を capture し、constructor 内で upper / lower arm length と shoulder width を測っている（`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:98`, `sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:125`, `sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:129`, `sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:131`）。profile factory はこの測定方針と同じ normalized bone node / world position を使う。
- `SincroPoseRetargeter.attachVrm()` は現在左右 IK solver と CCD probe を作って reset している（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:76`, `sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:77`, `sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:78`）。ここで profile を作って保持する。
- `VRMCharacterManager.initializeVrmControllers()` は VRM load 後に controller と retargeter を初期化している（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:129`, `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:134`）。本タスクでは manager から直接 profile を計測せず、retargeter attach の境界に閉じる。
- 設計文書は Phase 5 までの temporal 責務と Phase 6 以降の solver / composer 責務を分けている（`documents/design/frontend/character/motion.md:143`, `documents/design/frontend/character/motion.md:156`）。profile の責務も同じ Phase 6 境界に追記する。

## テスト

- `cd sincromisor-frontend && npm run test -- minimalAvatarMotionProfile`
- `cd sincromisor-frontend && npm run test -- sincroPoseRetargeter`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変更しないが、developer-visible な motion pipeline contract と debug snapshot に `MinimalAvatarMotionProfile` が増えるため、`documents/design/frontend/character/motion.md` に v1 schema、計測 fallback、Phase 7 へ残す範囲を同期する。
