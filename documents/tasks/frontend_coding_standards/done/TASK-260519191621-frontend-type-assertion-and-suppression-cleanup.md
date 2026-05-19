# TASK-260519191621 frontend type assertion and suppression cleanup

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: High
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

TypeScript 規約で hard 禁止されている `as Foo` 型アサーションと、形式不足の `@ts-expect-error` を整理し、外部 I/O / 外部ライブラリ境界を type guard・schema・境界 adapter で吸収する。

## 背景

`TASK-260517134244` では `any` 除去と RTC / DataChannel 境界の Zod schema 導入は完了している。一方で、2026-05-19 の再確認では `as const` 以外の型アサーションが 69 件残っていた。

また、`@lookingglass/webxr` の型定義不足を吸収するための `@ts-expect-error` が 2 件残っているが、`documents/rules/coding-ts.md` が求める `// reason: ... / 解消条件: ...` 形式になっていない。

## スコープ

- `as Foo` / `as unknown as Foo` / DOM event `as EventListener` の整理
- select value など DOM 入力値の union parse helper 化
- MediaPipe / three-vrm / Looking Glass / ONNX Runtime など外部ライブラリ境界の adapter 化
- `@ts-expect-error` の形式修正、または型 shim / adapter による削除
- 残す必要がある型アサーションへの `// reason: <理由>` 明示

## 非対象

- サーバー contract の変更
- DataChannel payload の互換性変更
- 外部ライブラリの fork / patch
- 大規模 UI リファクタ

## 優先対象例

- `src/motion-debug/motionDebugControls.ts`
- `src/pose-landmarker-spike/main.ts`
- `src/ts/SincroVRM/VRMScene/VRMScene.ts`
- `src/ts/SincroVRM/LookingGlass/lookingGlassInputRecovery.ts`
- `src/ts/SincroVRM/LookingGlass/lookingGlassPolyfillLifecycle.ts`
- `src/ts/CharacterGaze/OneEuroFilter.ts`
- `src/ts/CharacterGaze/FaceTargetSelector.ts`
- `src/ts/SincroVRM/VRMCharacter/sincroCcdIkProbe.ts`

## 完了条件

- `as const` 以外の型アサーションが 0 件、または残す行に `// reason: <理由>` がある。
- `@ts-expect-error` を残す場合は、直後に `// reason: ... / 解消条件: ...` がある。
- DOM / vendor API / worker global など、型が弱い境界は adapter または type guard に寄せられている。
- `cd sincromisor-frontend && npm run check` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。
- 変更した pure helper / schema に必要な最小テストが追加され、`npm run test` が成功する。

## 確認コマンド案

```sh
rg -n "\sas\s+(?!const\b)" sincromisor-frontend/src --glob '*.{ts,tsx}' -P
rg -n "@ts-ignore|@ts-expect-error" sincromisor-frontend/src --glob '*.{ts,tsx}'

cd sincromisor-frontend
npm run test
npm run check
npm run build
```

## 完了時確認

- `rg -n "\sas\s+(?!const\b)" sincromisor-frontend/src --glob '*.{ts,tsx}' -P`: 該当なし
- `rg -n "@ts-ignore|@ts-expect-error" sincromisor-frontend/src --glob '*.{ts,tsx}'`: 該当なし
- `cd sincromisor-frontend && npm run test`: 成功
- `cd sincromisor-frontend && npm run check`: 成功
- `cd sincromisor-frontend && npm run build`: 成功
