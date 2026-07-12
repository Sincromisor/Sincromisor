# TASK-3116 Sincro Pose IK の観測性・実機検証・設計同期

- 作成日: 2026-05-14
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3115`, `TASK-260517014025`, `TASK-260517042345`, `TASK-260517053106`

## 目的

簡易 IK 化した `sincro` pose retarget を、実カメラ・複数 VRM・複数 viewport で最終確認し、調整値と確認結果を `impl.md`、`eval.md`、`acceptance/`、`artifacts/` に残す。

IK は見た目の破綻が環境差やモデル差で出やすい。実装だけで完了扱いにせず、Debug Console と `motion-debug` で入力、target、solver、VRM 適用を切り分けながら、最後に人間の目で許容範囲を判断する。

## 背景

- `TASK-3111` では低振幅 retarget として正式化されたが、簡易 IK 導入後は確認観点が変わる。
- 腕 IK は肩幅、カメラ距離、VRM の腕長・初期姿勢、MediaPipe confidence に強く依存する。
- 本プロジェクトでは設計文書 `documents/design/` を正本として扱うため、実装後に `documents/design/frontend/character/` 配下の同期が必要になる。

## スコープ

- 実カメラ確認手順と結果を `impl.md`、`eval.md`、`acceptance/`、`artifacts/` へ残す
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
5. review 後の `task.md` は仕様として固定し、実施ログやスクリーンショット、snapshot は `impl.md`、`eval.md`、`acceptance/`、`artifacts/` に保存する。

## 実装対象候補

手編集候補:

- `sincromisor-frontend/src/features/debug/model/debugConsoleManager.ts`
- `sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionRuntime.ts`
- `sincromisor-frontend/src/features/debug/react/**`
- `sincromisor-frontend/src/features/dialog/model/dialogManager.ts`
- `sincromisor-frontend/src/features/dialog/model/dialogStateStore.ts`
- `documents/design/frontend/character/motion.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/frontend/pages.md`
- `tasks/character-sincro-motion/task-3100-sincro-motion-foundation-epic/task.md`

参照・生成・確認対象:

- `sincromisor-frontend/src/features/settings/react/fields/settingsFields.tsx`
- `sincromisor-frontend/src/pages/simpleVrm/react/components/settingsSections.tsx`
- `tasks/character-sincro-motion/index.md` は `npm run tasks:index` で更新し、手編集しない。

## 検証条件

最低構成:

- ブラウザ: Playwright / Chromium を基本にする。別ブラウザで確認した場合は追加結果として扱う。
- URL:
    - `http://127.0.0.1:5173/simple-vrm/`
    - `http://127.0.0.1:5173/motion-debug/`
- viewport:
    - desktop: `1280x720`
    - mobile: `390x844`
- VRM:
    - 2 体以上を確認する。
    - 1 体は通常利用する default / reference VRM とする。
    - もう 1 体以上は、体型または humanoid optional bone 構成が異なる VRM とする。優先例は、`upperChest` なし、shoulder bone なし、finger bone 一部欠落、頭身または腕長が大きく異なるモデル。
    - 2 体目を用意できない場合、このタスクは PASS にしない。`impl.md` に未実行理由と残リスクを残し、評価は FAIL または blocked 判断へ回す。

姿勢パターン:

- 両腕が見えているが手首 confidence が低い構図。
- 片手上げ。
- 横開き。
- 肘曲げ。
- 片腕欠損。
- 両腕欠損。
- 近距離上半身構図。

OK 条件:

- `simple-vrm` と `motion-debug` のどちらでも、検出、target quality、solver、VRM 適用 gate、fallback のどこで状態が変わったかを snapshot または Debug Console 表示から説明できる。
- 各 VRM で、腕が一瞬で 180 度近く反転する、肩が胴体へ深くめり込む、手首 roll が継続的に暴れる、腕が T pose 付近へ固定されたまま戻らない、のいずれも再現しない。
- tracking loss または low confidence では、急停止ではなく neutral / face-only / fallback へ戻る理由を記録できる。
- desktop / mobile viewport で、Settings、Debug Console、`motion-debug` の主要操作が表示領域外へ消えず、テキスト重なりや横スクロールによって確認不能にならない。
- IK 既定値を変更した場合は変更前後の snapshot またはスクリーンショットを保存し、変更しない場合は現行既定値を採用値として `impl.md` に記録する。

NG 条件:

- `simple-vrm` または `motion-debug` の初期表示、VRM 読み込み、camera start、pose detection、snapshot 取得のいずれかで未説明の例外が出る。
- 1 体目の VRM だけで成功し、2 体目以降の VRM 差分を確認していない。
- 崩れや fallback の有無をスクリーンショット、snapshot、または `impl.md` の観察ログで後から追えない。
- viewport 確認が `simple-vrm` だけで、`motion-debug` の desktop / mobile を確認していない。

保存先:

- 実施ログと採用判断: `tasks/character-sincro-motion/task-3116-sincro-pose-ik-observability-verification-and-design-sync/impl.md`
- 評価判定: `tasks/character-sincro-motion/task-3116-sincro-pose-ik-observability-verification-and-design-sync/eval.md`
- チェックリストや手順メモ: `tasks/character-sincro-motion/task-3116-sincro-pose-ik-observability-verification-and-design-sync/acceptance/`
- snapshot JSON、runtime metrics: `tasks/character-sincro-motion/task-3116-sincro-pose-ik-observability-verification-and-design-sync/artifacts/`
- スクリーンショット原本: `work/private-artifacts/task-3116-sincro-pose-ik-observability-verification-and-design-sync/screenshots/`（Git管理外）

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

```sh
playwright-cli open http://127.0.0.1:5173/motion-debug/
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

`motion-debug` では、ブラウザ console または Playwright 経由で次を確認する。

```js
await window.__SINCRO_MOTION_DEBUG__.startCamera();
await window.__SINCRO_MOTION_DEBUG__.waitForPoseDetected();
await window.__SINCRO_MOTION_DEBUG__.getSnapshot();
```

camera permission や MediaPipe asset 不足で失敗した場合は、例外 message、browser、URL、viewport、再現手順を `impl.md` に記録し、可能なら console log を `artifacts/` に保存する。

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

## Roadmap Phase 0 gate

`documents/research/character_animation/roadmap.md` の「Phase 0: 現行 `sincro` 基盤の確定」は、本タスクの完了を前提にする。

本タスクでは、現行の face / pose / IK / debug 基盤について、実機で確認できたこと、確認できなかったこと、既知限界、後続タスクへ送るべき課題を記録する。Phase A 以降の replay / metrics、`CanonicalUpperBodyState`、`ReliabilityMap`、`TemporalStateEstimator` などの新規基盤実装は本タスクへ追加しない。

実機確認の結果、現行基盤の延長で直せる軽微な調整が必要になった場合は本タスク内で扱ってよい。評価基盤や中間 contract の新設が必要な場合は、roadmap の大フェーズに沿う後続タスクとして切り出す。
