# TASK-2001 メディアデバイス列挙サービス追加

- 作成日: 2026-04-19
- ステータス: Open
- 優先度: High

## 目的

ブラウザのメディアデバイス一覧取得、権限後のラベル更新、デバイス抜き差し監視を UI から独立して扱えるようにする。

## 関連設計

- `documents/design/frontend_ui.md`

## スコープ

- `enumerateDevices()` の結果を UI 向けに正規化する service / manager の追加
- `devicechange` 監視
- `audioinput` / `videoinput` の抽出
- ラベル未解決時のフォールバック表示
- 選択済み deviceId の有効性確認

## 非対象

- 実際の `getUserMedia` 再取得
- RTC トラック差し替え
- Gaze カメラ再初期化

## 実装タスク

1. メディアデバイス一覧を取得する service を追加する。
2. `audioinput` / `videoinput` ごとの選択肢型を定義する。
3. ラベルが空のケースを UI 向け表示名へ変換する。
4. `devicechange` を購読し、一覧再取得できるようにする。
5. 選択済み deviceId が消えた場合に検知できる API を用意する。
6. React 側が購読しやすい snapshot / subscribe 形式に整理する。

## 想定変更箇所

- `sincromisor-frontend/src/ts/` 配下の新規 service
- `sincromisor-frontend/src/react/` 配下の関連 hook

## 完了条件

- UI からマイク一覧とカメラ一覧を取得できる。
- 権限前後でラベル更新に追従できる。
- デバイス抜き差し時に一覧が更新される。

## 確認

- 権限前はフォールバック名、権限後は実ラベルが表示されることを確認する。
- USB デバイスの抜き差しで一覧更新が起きることを確認する。
