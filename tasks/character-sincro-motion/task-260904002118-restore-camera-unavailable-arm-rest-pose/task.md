# カメラ利用不可時の腕の待機姿勢を復元

## 背景 / 目的

`sincro` モードでカメラを利用できない場合、キャラクターの両腕が横へ伸びた T ポーズになる不具合が再現している。利用者が求める挙動は、過去の既定動作と同じく、追跡入力がない間は腕を下ろした待機姿勢にすることである。

現行の `VRMCharacterManager.update()` は、カメラ欠損により `SincroPoseRetargetFrame.active` が `false` でも composer を実行する。`sincroVrmPoseComposerDryRun.ts` の tracking layer は weight `0` になり、fallback layer が上腕を含む上半身ボーンへ単位回転を設定するため、`setNormalizedPose()` が VRM の正規化基準姿勢である T ポーズを毎フレーム適用する。

full composer 適用前の `ArmBoneController` は、上腕を左右それぞれ約 75 度下ろし、前腕を軽く曲げる待機姿勢を持っていた。full composer が上半身の唯一の書き手になった現在もこの controller はロード直後だけ同じ姿勢を適用するが、次の更新で単位回転に上書きされる。本タスクでは単一 writer の設計を維持したまま、composer の fallback 姿勢を腕を下ろした待機姿勢へ戻す。

## 完了条件（受け入れ条件）

- [ ] `sincro` モードでカメラを開始できず Pose tracking が無効な場合、full composer が両腕を下ろした待機姿勢を適用し、T ポーズにしない。
- [ ] カメラ停止、Pose 未検出、face-only など `SincroPoseRetargetFrame.active === false` の経路も同じ待機姿勢へ退避し、古い tracking pose を保持しない。
- [ ] tracking frame が有効な場合は既存の tracking / IK / semantic / finger layer の結果を維持する。
- [ ] `VRMCharacterManager.update()` は full composer を上半身の唯一の本番 writer として維持し、旧 `ArmBoneController.update()` を fallback writer として再導入しない。
- [ ] inactive frame の composer result と、その result が `setNormalizedPose()` へ渡されることを対象テストで固定する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` の fallback 姿勢の説明を実装に合わせる。

## 設計判断

- 修正箇所は full composer の fallback layer とする。旧 direct writer の復活は、上半身の書き手を再び複数にするため行わない。
- 待機姿勢は既存 `ArmBoneController` の基準姿勢を根拠にし、少なくとも上腕を左右約 75 度下ろして前腕を軽く曲げる。新しい設定値や利用者向け設定は追加しない。
- fallback は現在 frame の明示的な pose として毎回合成する。直前の tracking pose の流用は、カメラ停止後に古い姿勢が残るため行わない。

## スコープ境界

- 本タスクで行うこと: composer fallback pose の修正、inactive frame の回帰テスト、関連する character 設計文書の同期。
- 本タスクで行わないこと: カメラ取得処理、MediaPipe、tracking 精度、IK、semantic gesture、待機アニメーション全体の再設計、WebRTC / backend 契約の変更。

## 実装方針

- `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts` の `createFallbackPose()` を起点に、単位回転になっている左右の上腕・前腕・手の fallback を既存の腕の待機姿勢へ合わせる。
- `sincromisor-frontend/src/character/vrmCharacter/armBoneRotationPose.ts` と `armBoneHandPose.ts` に残る既定角度を参照し、同じ数値の無関係な再定義を増やさずに済む最小の共有方法を選ぶ。
- `sincromisor-frontend/src/character/runtime/__tests__/sincroVrmPoseComposerDryRun.test.ts` に inactive な `NEUTRAL_POSE_FRAME` の result が両腕を下ろす回転を持つ確認を追加する。
- 必要な場合だけ `sincromisor-frontend/src/character/vrmCharacter/__tests__/armBoneController.test.ts` に manager からの適用確認を追加する。既存の「full application が唯一の upper-body writer」という確認は維持する。

## テスト

- `cd sincromisor-frontend && npm run test -- src/character/runtime/__tests__/sincroVrmPoseComposerDryRun.test.ts src/character/vrmCharacter/__tests__/armBoneController.test.ts`
- `cd sincromisor-frontend && npm run check`
- 開発用ブラウザーでカメラを許可しない `sincro` モードを一度表示し、両腕が下がり T ポーズにならないことを確認する。
- `npm run tasks:check`

## ドキュメント同期の要否

要。`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に、追跡入力がない場合も full composer が腕を下ろした fallback pose を所有することを反映する。公開 API、WebRTC、DataChannel、backend の契約変更はない。
