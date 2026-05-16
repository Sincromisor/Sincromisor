# TASK-260517053106 Sincro Arm IK の関節制約・簡易衝突回避

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-260517024505`, `TASK-3116`

## 目的

`sincro` pose retarget の腕 IK に、人体として不自然な姿勢を抑える関節制約と簡易 collision / no-go zone を追加する。

現在の `world_3d_ik` は MediaPipe の shoulder / elbow / wrist target を VRM normalized arm chain へ two-bone IK として適用できる。一方で、solver が満たしている制約は腕長、到達距離、neutral からの最大回転角が中心であり、肩・肘・前腕の人体的な可動域や、頭・胸・反対腕との貫通回避までは扱っていない。

本タスクでは入力 target の精度改善や smoothing より先に、モデル側で「そもそも取り得ない姿勢」「顔や胸へ食い込む姿勢」を抑止する。

## 背景

- 添付確認では、腕を顔の前にかざす姿勢で VRM の腕が顔周辺へ入り込み、不自然な曲がり方とブレが目立った。
- MediaPipe の wrist / elbow / world Z が遮蔽で揺れることは原因の一部だが、現行 solver は誤 target を人体制約で十分に止められていない。
- VRM normalized bones は姿勢適用の器であり、腕 IK 用の joint limit や self collision を自動では提供しない。
- `SincroArmIkSolver` は production path として採用済みのため、まずは既存 solver に制約を足し、外部 IK ライブラリ導入や full-body IK へ広げない範囲で安定化する。

## スコープ

- `SincroArmIkSolver` に人体寄りの joint constraint を追加する。
    - shoulder cone / lift / open の上限
    - elbow bend direction の安定化
    - forearm twist / lower arm delta の制限
    - neutral pose へ戻す時の急な反転抑制
- elbow pole が退化または反転しそうな場合に、前フレームまたは bind pose pole を優先して bend plane を安定させる。
- 頭・胸に対する簡易 collision proxy / no-go zone を追加する。
    - head sphere
    - chest capsule または ellipsoid
    - hand sphere / forearm capsule の近似
- proxy 侵入時の対応を決める。
    - target を proxy 外へ押し戻す
    - IK weight を下げて feature retarget へ寄せる
    - `world_3d_ik` から `screen_space_ik` または `feature_only` へ降格する
- Debug Console / motion-debug snapshot で、constraint と collision の発火理由を観測できるようにする。
- 既定値を、顔前横切り、胸前、片手上げ、横開きで破綻しにくい保守的な値に調整する。
- 設計文書に、IK solver が扱う constraint / collision / fallback の責務境界を同期する。

## 非対象

- MediaPipe model preset 切り替えや tracking 精度改善。
- solver 入力 target の時系列 stabilizer / 外れ値除去。
- 手指トラッキング。
- full-body IK、足接地、両手拘束。
- 物理エンジンや外部 IK ライブラリの導入。
- サーバー側 endpoint / JSON 契約変更。

## 実装方針

1. まず `SincroArmIkSolver` の出力姿勢を制約する。
    - 単純な quaternion 最大角だけでなく、肩と肘の意味的な可動域を別々に扱う。
    - コメントでは、座標系、neutral pose、制約を置く理由を Google style に沿って説明する。
2. collision は精密な mesh 判定ではなく、VRM bone 位置から作る軽量 proxy に限定する。
    - head / chest の world position をロード時またはフレーム更新時に測定する。
    - proxy の半径や余白は VRM の肩幅・腕長からスケールする。
3. 制約違反時は「急停止」より「弱める・押し戻す」を優先する。
    - 瞬間的な target 飛びで腕が跳ねないよう、IK weight の減衰と fallback reason を分ける。
4. `SincroPoseRetargeter` は constraint / collision の結果を runtime snapshot へ載せる。
    - 例: `joint_limited`, `elbow_pole_stabilized`, `head_collision_avoided`, `chest_no_go_zone`
5. motion-debug で同じ構図を再現しやすいよう、必要な観測値を `window.__SINCRO_MOTION_DEBUG__.getSnapshot()` から取得できるようにする。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroArmIkSolver.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/panels/SincroMotionPanel.tsx`
- `sincromisor-frontend/src/motion-debug/**`
- `documents/design/frontend/character/motion.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/decisions/ADR-260517-sincro-arm-ik-solver-adoption.md`

## 完了条件

- 顔の前に腕をかざす構図で、手・前腕が顔へ大きく貫通しない。
- 胸前に腕を寄せる構図で、前腕が胸へ深く入り込まず、IK が破綻しない。
- 肘が遮蔽または target と一直線に近い状態でも、肘の bend plane が頻繁に反転しない。
- 関節制約が発火しても、腕が急に跳ねず、IK weight または補正姿勢が滑らかに変化する。
- Debug Console または motion-debug snapshot で、入力欠損、joint limit、collision avoidance、fallback のどれが効いたか判別できる。
- `feature_only` / `screen_space_ik` / `world_3d_ik` の既存モード切り替えが壊れない。
- 複数 VRM で bone 欠損時に例外停止せず、constraint / collision を無効化して既存 fallback へ戻る。
- `cd sincromisor-frontend && npm run build` が成功する。
- 設計文書が更新され、constraint / collision の責務境界と非対象が明記されている。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

```sh
playwright-cli open http://127.0.0.1:5173/motion-debug/
```

## 手動確認観点

- 腕を顔の前で横切らせる。
- 手のひらを顔の前へ近づける。
- 胸前で肘を曲げる。
- 片手上げ、横開き、腕伸ばしを行う。
- 肘や手首を一時的に遮蔽する。
- `armIkStrength`、`armIkTargetScale`、`smoothingMs` を変えて、constraint が過剰に固くならないか見る。
- `world_3d_ik` と `screen_space_ik` を切り替え、constraint の発火理由と見た目の差を比較する。

## 設計同期メモ

- `documents/design/frontend/character/motion.md` に、`SincroArmIkSolver` が人体的 joint constraint と簡易 collision proxy を持つことを追記する。
- `documents/design/frontend/character/tracking.md` に、入力 target の品質問題と solver-side constraint を別責務として扱うことを追記する。
- ADR は、外部 solver を採用しないまま既存 two-bone solver を拡張する判断として追記が必要か確認する。

## 後続検討

- 本タスク後もブレが残る場合は、solver 入力 target の stabilizer / hysteresis / model preset 切り替えを別タスク化する。
- 腕以外の自己衝突や足接地が必要になった場合は、full-body IK / physics proxy / worker 化を別 ADR で検討する。

## 実施結果

- `SincroArmIkSolver` に shoulder target constraint、pole stabilization、head / chest no-go zone、constraint weight scale を追加した。
- constraint / collision runtime を `SincroPoseRetargetedArm.constraint` として Debug Console / motion-debug snapshot から観測できるようにした。
- `documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/decisions/ADR-260517-sincro-arm-ik-solver-adoption.md` を同期した。
- `cd sincromisor-frontend && npm run build` は成功。
- 差分対象の Biome check と関連 Markdown の Prettier check は成功。全体 `npm run check` は既存の `CharacterGaze.ts` / `PopMessageService.ts` などの lint で失敗。
