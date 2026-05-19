# TASK-260519234130 frontend conversation talk extraction

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

`TalkManager` と会話進行状態を `src/features/conversation/talk` に移し、RTC transport と会話状態管理を分離する。

## スコープ

- `talkManager` / `talkManagerTypes` の移動
- mora / speech progress / telop segment buffer の配置整理
- CharacterBehaviorState からの参照更新
- AppController event mapper からの参照更新

## 非対象

- DataChannel payload 仕様変更
- chat / telop React UI の移動
- キャラクター motion ロジック変更

## 完了条件

- 会話状態管理が `features/conversation/talk` にまとまっている
- `features/rtc` が TalkManager を所有していない
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
