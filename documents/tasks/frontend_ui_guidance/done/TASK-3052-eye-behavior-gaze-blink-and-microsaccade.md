# TASK-3052 目線・まばたき・視線外し・microsaccade

- 作成日: 2026-05-08
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3048`
- 依存: `TASK-3049`

## 目的

首追従だけではなく、目の動きで「相手を見ている」「考えている」「話している」感覚を作る。VRM 標準 expression、eye bone、lookAt の利用可能性を確認し、モデル差に強く、不自然に泳がない eye behavior を実装する。

## 背景

- 現状は目の動きが独立実装されておらず、顔検出に対して首だけが動く。
- `FaceMorphController` は blink をランダムに発火しているが、対話状態とは連動していない。
- 目線は小さな動きでも印象に強く効く一方、動きすぎると不安定で不自然に見える。

## スコープ

- `EyeBehaviorController` または同等の controller 追加
- `lookUp/lookDown/lookLeft/lookRight` expression の利用可否確認と適用
- eye bone または VRM lookAt の利用可否確認
- 状態別の視線維持、視線外し、microsaccade
- まばたき頻度の状態連動
- 首追従と目線先行の調整

## 非対象

- 顔検出アルゴリズム変更
- 新しい MediaPipe face landmark への置き換え
- 個別 VRM 専用の表情名チューニング
- AI 発話中の腕 gesture

## 実装方針

1. VRM 標準の look expression が存在する場合は expression で目線を表現する。
2. look expression がない場合は eye bone または lookAt を検討し、扱いが不安定な VRM では無効化できるようにする。
3. 顔位置追従では目線が首より少し先行し、その後に首/上半身が追う。
4. ユーザー発話中は視線維持を強め、考え中は短い視線外しを入れる。
5. microsaccade は低頻度、低振幅に留め、ランダムすぎる泳ぎ目にしない。
6. blink は既存の完全ランダムから、状態と直近 blink 時刻を考慮した schedule へ移行する。
7. surprised など目を開く表現と blink が競合しないよう、短い suppress 期間を持つ。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/EyeBehaviorController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`

## 完了条件

- 目線が首追従とは別に動き、顔位置へ自然に追従する。
- 考え中に短い視線外しが入り、すぐ不自然に泳がない。
- ユーザー発話中は視線維持が強まり、聞かれている感覚が出る。
- blink が状態に応じて変化し、surprised や視線動作と破綻しない。
- look expression や eye bone がない VRM でも例外停止しない。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- カメラ ON で顔を左右へ動かした時、目線が先行し、首が後から追う。
- 顔検出が揺れても目が細かく震えない。
- 30 秒待機しても blink と microsaccade が機械的すぎない。
- AI 応答待ちの考え中表現で、視線外しが自然に見える。
- 複数 VRM で look expression の有無に応じた fallback が効く。

## レビュー対応メモ

- 2026-05-09:
  - `lookLeft/lookRight` と `lookUp/lookDown` の有無を軸別に判定し、一部 look expression だけを持つ VRM では不足軸だけ `leftEye/rightEye` ボーンへ fallback するようにした。
  - `CharacterGaze` の video frame が一定時間進まない場合は検出 stale とみなし、leave callback と空 detection callback を発火して AutoMute / `CharacterBehaviorState` の `face_lost` が更新されるようにした。
- 2026-05-10:
  - eyeball の顔位置追跡が強く見えるモデル向けに、キャラクター表示設定へ `characterEyeTrackingScale` を追加し、look expression / eye bone fallback の追跡量を即時調整できるようにした。
