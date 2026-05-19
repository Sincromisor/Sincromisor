# TASK-260519234137 frontend character behavior directory migration

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: Medium
- 種別: Task

## 目的

会話、VAD、gaze 由来のキャラクター振る舞い状態を `src/character/behavior` にまとめ、motion algorithm と状態解釈を分ける。

## スコープ

- `characterBehavior*` 系ファイルの移動
- eye / blink / expression controller の配置整理
- CharacterBehaviorState から TalkManager / gaze への参照更新
- Debug Console snapshot との依存確認

## 非対象

- IK / retargeting の移動
- 表情や motion の挙動変更
- settings UI の変更

## 完了条件

- behavior state と関連 controller が `src/character/behavior` にまとまっている
- `character/behavior` が UI component を直接参照していない
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
