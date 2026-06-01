# TASK-3116 Sincro Pose IK の観測性・実機検証・設計同期

- 作成日: 2026-05-14
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3115`, `TASK-260517014025`, `TASK-260517042345`, `TASK-260517053106`

## 目的

簡易 IK 化した `sincro` pose retarget を、実カメラ・複数 VRM・複数 viewport で最終確認し、調整値と確認結果を正本タスクへ残す。

IK は見た目の破綻が環境差やモデル差で出やすい。実装だけで完了扱いにせず、Debug Console と `motion-debug` で入力、target、solver、VRM 適用を切り分けながら、最後に人間の目で許容範囲を判断する。

## 背景

- `TASK-3111` では低振幅 retarget として正式化されたが、簡易 IK 導入後は確認観点が変わる。
- 腕 IK は肩幅、カメラ距離、VRM の腕長・初期姿勢、MediaPipe confidence に強く依存する。
- 本プロジェクトでは設計文書 `documents/design/` を正本として扱うため、実装後に `documents/design/frontend/character/` 配下の同期が必要になる。

## スコープ

- 実カメラ確認手順と結果をタスク本文へ残す
- `simple-vrm` と `motion-debug` の両方で pose / IK の状態を確認する
- Debug Console と `motion-debug` snapshot で、検出、target quality、solver、VRM 適用 gate、fallback を切り分ける
- IK 強度、target smoothing、return-to-neutral、max rotation など主要パラメータの既定値を最終判断する
- 複数 VRM で、腕長・初期姿勢・欠損ボーン差分による破綻が許容範囲か確認する
- desktop / mobile viewport で Settings / Debug Console / `motion-debug` の表示崩れを確認する
- 確認結果から仕様差分が出た場合のみ、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` を追記する

## 非対象

- IK solver の大幅な作り直し
- 新規外部ライブラリの導入
- サーバー側 endpoint / JSON 契約の変更
- WebRTC signaling の変更

## 実装方針

1. 開発者が「検出していない」「target はあるが solver が止めている」「solver は動いているが VRM 側で抑制されている」を切り分けられる表示にする。
2. ユーザー向け設定は ON/OFF と強度を中心にし、詳細パラメータは Debug Console に寄せる。
3. `chat` と `sincro` の motion priority 差分を文書へ明記する。
4. 確認結果には、うまくいく構図だけでなく破綻しやすい構図も残す。

## 実装対象候補

- `sincromisor-frontend/src/features/debug/model/debugConsoleManager.ts`
- `sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionRuntime.ts`
- `sincromisor-frontend/src/features/debug/react/**`
- `sincromisor-frontend/src/features/settings/react/fields/settingsFields.tsx`
- `sincromisor-frontend/src/pages/simpleVrm/react/components/settingsSections.tsx`
- `sincromisor-frontend/src/features/dialog/model/dialogManager.ts`
- `sincromisor-frontend/src/features/dialog/model/dialogStateStore.ts`
- `documents/design/frontend/character/motion.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/frontend/pages.md`
- `documents/tasks/character_sincro_motion/README.md`
- `documents/tasks/character_sincro_motion/open/TASK-3100-sincro-motion-foundation-epic.md`

## 完了条件

- Debug Console と `motion-debug` で IK の入力、solver、VRM 適用 gate、fallback を切り分けられる。
- IK 強度と主要 smoothing / clamp 値の既定値が決まっている。
- 実カメラで、両腕が見えているが手首 confidence が低い構図、片手上げ、横開き、肘曲げ、片腕欠損、両腕欠損、近距離上半身構図を確認済み。
- 複数 VRM で破綻が許容範囲に収まることを確認済み。
- Settings / Debug Console / `motion-debug` が desktop / mobile viewport で崩れない。
- `motion-debug` で camera permission を伴う `startCamera()` と `waitForPoseDetected()` の成功または環境由来の失敗理由を記録している。
- `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に追記が必要な仕様差分がない、または追記済み。
- `cd sincromisor-frontend && npm run build` が成功する。

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

- IK OFF / 低強度 / 標準強度 / 高強度を切り替えて、破綻しない既定値を決める。
- 実カメラ距離を変えて、肩幅正規化が安定しているかを見る。
- 腕をすばやく動かした時に、追従遅れと jitter のバランスが許容できるかを見る。
- Worker fallback、Pose OFF、face-only fallback で UI と顔同期が継続する。

## 実施ログ

### 2026-05-17

- 実カメラ観測で world 3D IK の腕方向が逆転して見えたため、MediaPipe world target から VRM target への軸変換を調整した。
    - X は入力 video と同じ左右を維持する。
    - Y は Three.js/VRM の Y-up に合わせて反転する。
    - Z は表示側奥行きへ合わせて反転し、従来通り 0.72 倍に弱める。
- 肩が上がりきらない挙動に対して、既定の IK 強度・target scale・上腕回転上限を上げた。
- 片腕を完全に上げた時に上腕がTポーズ高さで止まる挙動に対して、上方向 target の到達距離下限を腕長寄りへ補正した。
- 完全上げポーズで解いた姿勢が neutral 側へ戻りすぎないよう、既定の IK 強度を 1.0 にした。

### 2026-05-16

- Debug Console の `Sincro` tab に左右腕の solver output (`Left Solver` / `Right Solver`) を追加した。
    - target availability (`Left/Right Targets`) と retarget frame (`ikMode`、anchor reason、腕ごとの `ikActive` / `fallbackReason` / additive rotation) を同じ tab で確認できる。
    - 「検出していない」「target 欠損」「solver fallback」「VRM 適用 gate による neutral」を切り分ける表示にした。
- Pose retarget 調整に IK 専用パラメータを追加した。
    - `armIkStrength`
    - `armIkTargetScale`
    - `armIkMaxLiftRad`
    - `armIkMaxOpenRad`
    - `armIkMaxForearmFlexRad`
- `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` を更新し、簡易 IK 後の `SincroPoseRetargeter` / `SincroPoseRetargetFrame` / Debug Console 観測項目 / 手動確認観点を同期した。
- `desktop 1280x720` と `mobile 390x844` で Debug Console / Settings の表示を確認した。
    - `#debugConsole` / 基本設定 dialog の横 overflow は検出されなかった。
    - backend 未起動のため `/api/v1/RTCSignalingServer/config.json` は 404、ブラウザ権限未許可のためカメラ/マイクは `Permission denied`。どちらも今回の UI 変更とは別の確認環境由来。

## 未完了の実機確認

- 実カメラ + `face_landmarker.task` 配置状態での head pose / blink / mouth blendshape 実測。
- 実カメラでの Pose 推論負荷、FaceLandmarker 同時実行負荷、上半身 landmark 安定性。
- 実カメラでの低 wrist confidence 構図における weak IK 起動と jitter 確認。
- 実カメラでの片手上げ、横開き、肘曲げ、片腕欠損、両腕欠損、近距離上半身構図の確認。
- 複数 VRM での破綻確認。
- IK OFF / 低強度 / 標準強度 / 高強度を切り替えた既定値の最終決定。
- `motion-debug` で camera permission を伴う `startCamera()` / `waitForPoseDetected()` の確認。

## 後続検討

- 簡易 IK の限界が明確になったら、`worldLandmarks` 利用、Kalidokit 等の局所導入、または独自 3D solver を比較するタスクを別途作る。

## 現状確認 2026-05-20

- 実装対象候補を `src/features/debug/**`、`src/features/settings/**`、`src/features/dialog/**`、`src/pages/simpleVrm/**` の現行配置へ更新した。
- 設計同期先は legacy flat の `documents/design/frontend_character.md` ではなく、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に集約した。

## 現状確認 2026-05-25

- 実装・設計同期・Debug Console / `motion-debug` 整備は完了済みとして、残作業を実機確認へ集約した。
- `TASK-3102` と `TASK-3105` の未実測項目、`TASK-260517014025` の gate 改善後実機確認、`TASK-260517042345` の camera permission 付き検証を本タスクでまとめて確認する。
