# TASK-3107 Sincro Motion の観測性・設定・確認・設計同期

- 作成日: 2026-05-11
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3103`, `TASK-3104`
- 条件付き依存: Pose 採用時は `TASK-3106`

## 目的

Sincro motion 基盤を実用可能な状態にするため、Debug Console、Settings、手動確認、負荷確認、設計文書同期を行う。単に動く実装ではなく、今後の調整・拡張・不具合切り分けがしやすい状態に整える。

## 背景

- 顔同期・姿勢同期は入力、推論、retarget、VRM 個体差、端末性能のどこで問題が起きているか分かりにくい。
- `sincro` は Sincromisor の中核機能であり、今後の拡張を見据えて観測性を最初から用意する必要がある。
- 設計変更を伴うため、実装後に `frontend_character.md` を更新する必要がある。

## スコープ

- Debug Console に sincro face の状態表示を追加する
- Pose 採用時は Debug Console に sincro pose の状態表示を追加する
- 必要最小限の Settings を追加または整理する
- tracker 状態、推論時間、fallback 状態、検出有無を確認できるようにする
- desktop / mobile viewport で UI と VRM 表示を確認する
- `npm run build` を実行する
- `documents/design/frontend_character.md` を実装後の構造に同期する
- 必要に応じて `documents/tasks/character_sincro_motion` の完了メモを更新する

## 非対象

- 大規模な UI redesign
- 専用チューニング画面の本格実装
- Pose が不採用の場合の Pose UI 実装
- サーバー側の変更

## 実装方針

1. Debug Console は開発・切り分け用として、顔同期の検出状態、head pose、主要 blendshape、推論時間を確認できるようにする。
2. Pose を採用する場合だけ、pose 検出状態、推論時間、fallback 状態、上半身 landmark の簡易表示を追加する。
3. Settings はユーザーが混乱しない範囲で、`sincro face` / `sincro pose` の ON/OFF と強度調整を検討する。
4. 表示文言はアプリ内で機能説明を長く書きすぎず、既存 settings help の粒度に合わせる。
5. Playwright で simple-vrm の desktop/mobile 表示を確認する。
6. 実カメラ・実マイクが必要な確認は手動確認項目として記録する。

## 実装対象候補

- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/**`
- `sincromisor-frontend/src/react/settings-fields/SettingsFields.tsx`
- `sincromisor-frontend/src/ts/UI/DialogManager.ts`
- `sincromisor-frontend/src/ts/UI/DialogStateStore.ts`
- `documents/design/frontend_character.md`
- `documents/tasks/character_sincro_motion/open/TASK-3100-sincro-motion-foundation-epic.md`

## 完了条件

- Debug Console で `sincro` の顔同期状態を切り分けられる。
- Pose 採用時は Debug Console で `sincro` の姿勢同期状態を切り分けられる。
- 必要な設定が過不足なく UI に反映されている。
- `chat` と `sincro` の挙動差が目視確認できる。
- `cd sincromisor-frontend && npm run build` が成功する。
- Playwright または手動で desktop/mobile 表示を確認している。
- `documents/design/frontend_character.md` が実装後の構造に更新されている。

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

- `chat` では相手を見る動き、`sincro` では同じ動きになることが明確に違う。
- `sincro` で head / blink / mouth の同期が過敏すぎない。
- 顔未検出時、顔復帰時、カメラ切替時に破綻しない。
- Debug Console を開いても推論・描画が極端に重くならない。
- Settings を開いた状態で、UI と VRM が重なって操作不能にならない。
- 低性能端末では face-only または pose-off へ逃がせる。

## 完了メモ

- Debug Console に `Sincro` tab を追加し、face / pose の検出状態、fallback、推論時間、fps、主要値を確認できるようにした。
- Status tab に `Sincro Face` / `Sincro Pose` の概要を追加した。
- Settings は既存の `talk mode`、`顔の向きを使う`、`上半身モーション`、`目線追跡` で必要最小限を満たすため、新しい設定項目は追加しなかった。
- `documents/design/frontend_character.md` の監視・運用記述を実装後の Debug Console 構造に同期した。
- `npm run build` 成功。
- Playwright CLI で `http://127.0.0.1:5173/simple-vrm/` を 1280x720 / 390x844 で確認。開発者ツールと `Sincro` tab は表示され、モバイル幅で横スクロールは出なかった。
- backend 未起動のため `/api/v1/RTCSignalingServer/config.json` は 404、ブラウザ権限未許可のためカメラ/マイクは `Permission denied`。実カメラ・実マイクでの head / blink / mouth 同期は手動確認に残す。
