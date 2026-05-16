# TASK-260517024506 Sincro IK solver 比較・採用判断

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: Medium
- 親タスク: `TASK-3100`
- 依存: `TASK-260517024505`

## 目的

自前 3D two-bone IK と、Three.js / 外部 IK solver の実用性を比較し、Sincromisor の本流として維持する IK 方針を決める。

調査では、自前 3D IK が現行の `@pixiv/three-vrm` normalized bone 運用に最も合う見込み。ただし、Three.js 公式 addon の `CCDIKSolver` や `closed-chain-ik-js` は将来の全身 IK / 複数 effector で有用な可能性がある。実装を重くする前に、片腕 PoC と採用判断を明文化する。

## 背景

- `CCDIKSolver` は Three.js 公式 addon で、CCD algorithm により `SkinnedMesh` の IK chain を解く。
- `THREE.IK` / `fullik` は FABRIK 系 solver だが、保守・API 安定性に注意が必要。
- `closed-chain-ik-js` は damped least squares の汎用 solver で、全身や閉ループ拘束には強いが導入コストが高い。
- Kalidokit は VRM 向け retarget の参考になるが、公式に deprecated とされているため中核採用は避ける。

## スコープ

- `CCDIKSolver` を片腕だけ PoC し、VRM normalized bone / raw bone / SkinnedMesh skeleton との相性を確認する
- 自前 3D two-bone IK と、到達感・安定性・実装複雑度・VRM 差分耐性を比較する
- `closed-chain-ik-js` の将来採用可否を机上評価し、全身 IK タスクへ進む条件を残す
- Kalidokit は参考実装として API / 出力形式 / deprecated リスクを整理する
- 採用判断を設計文書または ADR に残す

## 非対象

- 外部 solver の本番導入
- full-body IK の完成
- 手指 IK
- dependency 追加の恒久化
- サーバー側 endpoint / JSON 契約変更

## 実装方針

1. PoC は production path と分離し、Debug Console または一時 developer flag からのみ有効にする。
2. 片腕 chain だけを対象にし、既存の自前 3D IK と同じ target snapshot を入力にする。
3. `CCDIKSolver` は `SkinnedMesh.skeleton.bones` index が必要なため、VRM の normalized bone とは別に raw skeleton への適用経路を調査する。
4. PoC 後に dependency を残す場合は、理由と採用範囲を task / design / package change に明記する。
5. 比較軸は見た目だけでなく、保守性、bundle size、worker 化可能性、VRM 差分への強さ、Debug Console での説明可能性を含める。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroArmIkSolver.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `documents/design/decisions/`
- `documents/design/frontend/character/motion.md`

## 完了条件

- `CCDIKSolver` の片腕 PoC 結果が残っている。
- 自前 3D IK と外部 solver の比較表が task または設計文書に残っている。
- 本流にする solver 方針が明記されている。
- 外部 solver を採用しない場合も、その理由と再検討条件が残っている。
- dependency を追加した場合は `package.json` / `package-lock.json` の差分理由が明確になっている。
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
```

## 判断メモ

現時点の仮説は以下。

- 本流: 自前 3D two-bone IK + `@pixiv/three-vrm` normalized bone 適用
- 比較対象: Three.js 公式 `CCDIKSolver`
- 将来候補: `closed-chain-ik-js` による full-body / multi-effector IK
- 参考のみ: Kalidokit

この仮説が外れた場合は、`TASK-260517024505` の solver 境界を維持したまま中身を差し替えられるようにする。

## 実施結果

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/sincroCcdIkProbe.ts` を追加し、VRM ロード時に左腕 raw skeleton chain で `CCDIKSolver` の one-iteration smoke test を行う PoC を作成した。
- PoC は production pose retarget path と分離し、Debug Console の `CCDIK PoC` 表示だけに反映する。
- `CCDIKSolver` は既存 dependency の `three/examples/jsm/animation/CCDIKSolver.js` を利用し、package 追加は行わない。
- 採用判断は `documents/design/decisions/ADR-260517-sincro-arm-ik-solver-adoption.md` に記録した。
- 現在設計は `documents/design/frontend/character/motion.md` に反映した。

## 比較表

| solver                 | 到達感                                       | 安定性                                                                           | 実装複雑度          | VRM 差分耐性                                                                       | Debug Console での説明可能性                                           | 判断     |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| 自前 3D two-bone IK    | 手首 target と肘 pole を腕長内で直接満たせる | neutral quaternion、reach clamp、max delta を Sincromisor 側で制御可能           | 片腕 chain では低い | normalized bone 測定を入口にできるため強い                                         | target clamp / weight / fallback reason をそのまま表示できる           | 本流採用 |
| Three.js `CCDIKSolver` | raw skeleton chain では到達を解ける          | CCD iteration と角度制限は使えるが、VRM normalized pose へ戻す bridge が別途必要 | 中から高            | raw skeleton index と target bone 追加が必要で、normalized bone 運用とは相性が弱い | PoC 診断としては表示可能。本番挙動説明には bridge 状態の追加表示が必要 | PoC のみ |
| `closed-chain-ik-js`   | full-body / multi-effector では期待できる    | damped least squares の制約設計次第                                              | 高い                | VRM bridge と worker 化の設計が必要                                                | solver 制約と収束状態の UI 設計が必要                                  | 将来候補 |
| Kalidokit              | retarget 参考にはなる                        | deprecated のため中核安定性に懸念                                                | 低から中            | 出力形式を合わせる調整が必要                                                       | 参考値としてなら可能                                                   | 参考のみ |

## 採用判断

- 本流: 自前 3D two-bone IK + `@pixiv/three-vrm` normalized bone 適用。
- `CCDIKSolver`: raw skeleton chain の互換性確認 PoC に留める。production path へ入れるには、raw solver 結果を normalized pose へ戻す bridge と target bone 管理の設計が必要。
- `closed-chain-ik-js`: full-body / multi-effector / 足接地拘束が必要になった時に再評価する。
- Kalidokit: deprecated のため、中核 dependency ではなく参考実装として扱う。

## 確認結果

- `cd sincromisor-frontend && npm run build`: 成功。
- `npx biome check src/react/debug/panels/SincroMotionPanel.tsx src/ts/SincroVRM/VRMCharacter/sincroCcdIkProbe.ts src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts src/ts/UI/DebugConsoleManager.ts`: 成功。
- `npm run check:md`: 成功。
- `npm run check`: 既存の unrelated 指摘（`CharacterGaze.ts` の literal key、`vite.config.js` の `node:` import、`PopMessageService.ts` の non-null assertion など）で失敗。今回追加・変更した対象ファイル単位の Biome check は成功。
- `npm run dev -- --host 127.0.0.1` + `playwright-cli open http://127.0.0.1:5173/simple-vrm/`: Debug Console の Sincro tab で `CCDIK PoC` が表示されることを確認。
- default VRM では `left ready (raw_chain_solver_smoke_test_passed) / meshes 13 / normalized separate / raw chain found` を確認。
- ローカル確認ではカメラ/マイク permission と `RTCSignalingServer/config.json` の 404 が出るが、Sincro Motion panel と PoC 表示の確認には影響しない。
