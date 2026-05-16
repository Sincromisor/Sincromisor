# TASK-260517014025 Sincro Pose IK の手首 confidence gate 改善

- 作成日: 2026-05-17
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3113`, `TASK-3114`, `TASK-3115`, `TASK-3116`

## 目的

実カメラで腕が見えているにもかかわらず、手首 target の confidence が低く `ik_target_missing` となり、腕 IK が常時 `feature_only` へ落ちる問題を改善する。

現在の IK は破綻を避けるために shoulder / elbow / wrist の全 target が個別に `tracked=true` であることを要求している。実機確認では shoulder は高 confidence、elbow は中 confidence、wrist は低 confidence になりやすく、腕全体は見えていても IK だけが起動しない構図がある。

## 現象

Debug Console の `Sincro` tab で以下のような状態になる。

- `Status`: `detected`
- `Retarget`: `active`
- `IK`: `feature_only / confidence 1.00 / L ik_target_missing / R ik_target_missing`
- `Left Targets`: shoulder は `1.00`、elbow は `0.44-0.49` 前後、wrist は `lost 0.04-0.08 low_confidence`
- `Right Targets`: shoulder は `1.00`、elbow は `0.44-0.49` 前後、wrist は `lost 0.04-0.08 low_confidence`

この状態では `SincroPoseRetargeter.solveArmIk()` が左右とも `ik_target_missing` を返し、`SincroPoseRetargeter.retargetArm()` は feature retarget のみを返す。

## 原因メモ

- `SincroPoseTracker` の `MIN_LANDMARK_VISIBILITY` は `0.45`。
- 腕全体の `tracked` は shoulder / elbow / wrist の平均 confidence で判定されるため、shoulder が高 confidence なら腕 feature は active になりやすい。
- 一方、IK target は shoulder / elbow / wrist の各点が個別に `tracked=true` であることを要求する。
- `@mediapipe/tasks-vision` の `NormalizedLandmark` は少なくとも型上 `visibility` を持つが、現在の `presence()` は `presence` がなければ `visibility` に fallback するため、target confidence は実質 visibility 依存になる。
- wrist は手首が画面内にあっても visibility が低く出やすく、現在の single threshold では実用上 `lost` になりやすい。

## スコープ

- `SincroPoseTracker` の target 判定を、全体 pose / feature retarget / IK target で分ける。
- wrist target に対して、低 confidence でも座標が有限なら「弱い IK target」として使える状態を表現する。
- `SincroPoseRetargeter` が weak target を使う場合は、confidence に応じて IK 強度を落とす。
- Debug Console で、`tracked`、座標有効性、confidence、IK 使用可否、IK 強度 weight を切り分けて確認できるようにする。
- 実カメラ確認結果を `TASK-3116` または本タスクへ追記する。
- 必要に応じて `documents/design/frontend/character/` または legacy flat の同期先に、target quality / IK gate の仕様を反映する。

## 非対象

- 全身 IK への拡張。
- 手指トラッキングの追加。
- `worldLandmarks` 前提の 3D IK 本実装。
- Kalidokit 等の外部 motion / IK ライブラリ導入。
- サーバー側 endpoint / JSON 契約変更。

## 実装方針

1. `MIN_LANDMARK_VISIBILITY` を単純に下げるだけで終わらせない。
    - shoulder / hip / pose detected の gate まで緩くすると、上半身全体の誤検出が増える。
    - IK の wrist だけ、別 threshold と weight を持たせる。
2. target snapshot に IK 用の品質情報を追加する。
    - 候補: `hasFiniteCoordinates`、`usableForIk`、`ikWeight`、`quality: "strong" | "weak" | "lost"`。
    - 既存 `tracked` は「通常 target として十分信頼できる」意味に残す。
3. IK solver は shoulder / elbow が strong、wrist が weak 以上なら起動できるようにする。
    - wrist confidence が低い場合は `armIkStrength` に追加 weight を掛け、腕が跳ねないようにする。
    - wrist が完全欠損、座標非 finite、画面外 clamp に張り付く場合は従来通り fallback する。
4. elbow が threshold 境界にいるケースも実機値に合わせて扱う。
    - 添付ケースでは elbow が `0.44-0.49` 付近なので、strict `0.45` 境界で頻繁に揺れる可能性がある。
    - hysteresis または weak target weight を検討する。
5. Debug Console の文言を `ik_target_missing` だけで止めず、どの gate が落としたか分かる表示にする。
    - 例: `W weak 0.08 coords_ok ikWeight 0.22`
    - 例: `L ik_weak_wrist` / `R ik_elbow_low_confidence`

## 実装対象候補

- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseMotionSnapshot.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseTracker.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/panels/SincroMotionPanel.tsx`
- `documents/design/frontend/character/motion.md`
- `documents/design/frontend/character/tracking.md`
- `documents/tasks/character_sincro_motion/open/TASK-3116-sincro-pose-ik-observability-verification-and-design-sync.md`

## 完了条件

- 添付ケース相当の実カメラ状態で、wrist confidence が低くても座標が有限なら IK が weak mode で起動する。
- Debug Console で `feature_only`、`weak IK`、`full IK`、`fallback` の違いを判断できる。
- wrist / elbow confidence が threshold 付近で揺れても、腕が急に跳ねたり IK と feature-only が激しく切り替わったりしない。
- 腕を完全に画面外へ出した場合は、従来通りその腕だけ feature-only または neutral fallback へ戻る。
- `cd sincromisor-frontend && npm run build` が成功する。
- 実カメラで以下を確認し、結果をタスクに追記する。
    - 両腕が見えているが手首 confidence が低い構図。
    - 片手上げ。
    - 横開き。
    - 肘曲げ。
    - 片腕欠損。
    - 近距離上半身構図。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

```sh
playwright-cli open http://127.0.0.1:5173/simple-vrm/
```

## 設計同期メモ

この対応で `SincroPoseTargetPointSnapshot` の意味を拡張する場合、設計文書に以下を明記する。

- `tracked` は通常 target として十分な confidence を持つ状態。
- `usableForIk` または `quality=weak` は、座標は使えるが IK 強度を落とすべき状態。
- IK solver は target 欠損を単純な boolean ではなく、target quality と weight で判断する。
- Debug Console は MediaPipe 検出、target 正規化、IK gate、retarget 出力を分けて表示する。

## 実施ログ

### 2026-05-17

- `SincroPoseTargetPointSnapshot` に `quality`、`hasFiniteCoordinates`、`usableForIk`、`ikWeight` を追加した。
    - `tracked` は従来通り通常 target として十分信頼できる状態に残した。
    - wrist は confidence `0.04` 以上かつ座標が有限・画面近傍なら weak IK target として扱う。
    - elbow は confidence `0.38` 以上なら weak IK target として扱い、`0.45` 境界の揺れで IK が急に落ちにくいようにした。
- `SincroPoseRetargeter` を、shoulder strong / elbow usable / wrist usable で IK を起動する判定へ変更した。
    - weak target を使う場合は、target の最小 `ikWeight` を `armIkStrength` に掛けて feature retarget と合成する。
    - target 欠損理由は `ik_wrist_low_confidence`、`ik_elbow_out_of_frame` など joint 別に表示する。
- Debug Console の `Sincro` tab で target quality、座標有効性、IK 使用可否、IK weight、weak/full IK を確認できるようにした。
- `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に target quality / IK weight の仕様を同期した。
- `cd sincromisor-frontend && npm run build` が成功した。

## 未実施

- 実カメラ確認はこの環境では未実施。
    - 両腕が見えているが手首 confidence が低い構図。
    - 片手上げ。
    - 横開き。
    - 肘曲げ。
    - 片腕欠損。
    - 近距離上半身構図。
