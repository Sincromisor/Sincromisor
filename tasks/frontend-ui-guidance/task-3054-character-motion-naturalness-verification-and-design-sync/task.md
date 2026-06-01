# TASK-3054 自然さ調整・VRM 個体差対策・確認・設計同期

- 作成日: 2026-05-08
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3048`
- 依存: `TASK-3049`, `TASK-3050`, `TASK-3051`, `TASK-3052`, `TASK-3053`

## 目的

追加したキャラクターモーション全体を、自然さ、負荷、VRM 個体差、UI との共存の観点で調整し、設計文書へ反映する。単に動く状態ではなく、趣味プロダクトとして現時点で気持ちよく見える状態まで磨く。

## 背景

- 複数の motion controller を追加すると、首、目、上半身、腕、表情が同時に強く出て不自然になりやすい。
- VRM ごとにボーン構造、expression、表情の強度が異なるため、1モデルで良く見えても別モデルで破綻する可能性がある。
- 今回は設計変更を伴うため、`documents/design/frontend_character.md` の更新が必要。

## スコープ

- 追加モーション全体の強度、タイミング、easing、clamp 調整
- VRM 個体差への fallback 確認
- simple-vrm desktop/mobile の表示確認
- Debug Console / Settings との UI 共存確認
- `npm run build`
- 必要に応じた Playwright 確認
- `documents/design/frontend_character.md` の更新

## 非対象

- 新しい機能追加
- サーバー側 payload 拡張
- UI チューニング画面の新設
- Looking Glass 固有演出の最適化

## 実装方針

1. 追加した各 motion の強度を、待機、ユーザー発話、考え中、AI 発話ごとに確認する。
2. 首、目、上半身、腕が同時に最大化しないよう、状態別の重みと priority を調整する。
3. 動きが唐突な箇所には easing、hold、cooldown を追加する。
4. 存在しないボーン/expression で例外が出る箇所を洗い出し、任意要素として扱う。
5. Debug Console と Settings を開いた状態で、キャラクターの動きが UI を邪魔しないことを確認する。
6. 設計文書には実装後の最終構造を記述し、古い「首/表情中心」の説明を更新する。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/*`
- `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- `sincromisor-frontend/src/ts/RTC/TalkManager.ts`
- `documents/design/frontend_character.md`

## 完了条件

- 待機、ユーザー発話、考え中、AI 発話の各状態で、動きが自然に見える。
- 目線、首、上半身、腕、表情が競合して破綻しない。
- 複数 VRM で例外停止せず、表現できない部位は安全に無効化される。
- simple-vrm desktop/mobile でレイアウトや視認性が破綻しない。
- Debug Console / Settings 操作中に、キャラクターの動きが UI 操作を妨げない。
- `cd sincromisor-frontend && npm run build` が成功する。
- `documents/design/frontend_character.md` が更新されている。

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
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

## 手動確認観点

- カメラ OFF、マイク OFF、backend 未起動でも idle motion が破綻しない。
- カメラ ON で顔を動かした時、目線と首の追従が自然で震えない。
- マイク発話時に聞き姿勢が出るが、大げさすぎない。
- AI 発話中に口形、表情、頭、腕が自然に同期する。
- 長文応答で gesture がうるさくならない。
- happy/sad/angry/surprised で雰囲気差がある。
- 低スペック環境を想定し、明確な CPU/GPU 負荷悪化がない。

## 実施メモ

- 2026-05-09:
    - AI発話中の首・上半身・腕 gesture を低振幅化し、attack/release と beat duration を長めに調整した。
    - `neck` 欠損VRMでは `head` / `upperChest` / `chest` / `spine` へフォールバックするようにし、該当ボーンがない場合は頭部制御のみ無効化する。
    - mouth expression は存在する `aa/ih/ou/ee/oh` のみを駆動し、未実装プリセットでは安全にスキップする。
    - `documents/design/frontend_character.md` に自然さ調整、VRM個体差 fallback、確認観点を同期した。
    - `cd sincromisor-frontend && npm run build` 成功。
    - Playwright で `simple-vrm` を 1280x720 / 390x844 で確認し、Settings / Debug Console が前面UIとして操作できることを確認した。
    - backend 未起動、MediaPipe wasm 未配置、ブラウザ権限なしのため、RTC config 404 / Gaze wasm 404 / media permission error は既知のローカル検証条件として発生。VRMロードとUI表示は継続した。
    - レビュー対応として、口形/感情 controller の直接購読と独自 rAF を廃止し、発話・感情・motion の時刻正本を `CharacterBehaviorSnapshot` と `VRMCharacterManager.update()` に揃えた。
    - `npm run build` 成功。複数 VRM、実カメラ、実マイク、低スペック端末での自然さ確認は引き続き手動確認リスクとして残る。
    - hips/root が揺れ対象になるVRMで全身が左右/前後に漂って見えるため、`CharacterMotionOrchestrator` は hips を基準位置・基準回転に固定し、重心感は spine/chest/shoulder の低振幅 motion のみに限定した。
- 2026-05-10:
    - キャラクター表示設定に「上半身モーション」「目線追跡」のスライダーを追加し、`characterMotionScale` / `characterEyeTrackingScale` を runtime scene へ即時同期するようにした。
    - `npm run build` 成功。
