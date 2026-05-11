# TASK-3101 Sincro モーション基盤の設計整理と設計文書更新

- 作成日: 2026-05-11
- ステータス: Done
- 優先度: Critical
- 親タスク: `TASK-3100`

## 目的

`chat` の対話相手注視と `sincro` のものまね同期を設計上明確に分け、後続実装が迷わないよう `frontend_character.md` を中心に設計文書を更新する。

## 背景

- 現状ドキュメントでは `CharacterGaze` が顔認識、首追従、自動ミュートの中心として記述されている。
- `sincro` モードの本来目的である「ユーザーの顔・姿勢と同じ動きをする」設計は未記載である。
- この変更は Sincromisor の中核機能となるため、実装を始める前に用語、責務境界、段階導入方針を正本へ残す必要がある。

## スコープ

- `documents/design/frontend_character.md` に sincro motion 章を追加する
- `chat` と `sincro` の入力・状態・motion priority の違いを明文化する
- `SincroFaceTracker`、`SincroPoseTracker`、retargeter、tracker runtime の責務を定義する
- `FaceLandmarker` を顔同期の本流、`PoseLandmarker` を optional 上半身同期として位置づける
- 性能ゲート、Worker 化方針、face-only fallback 方針を記載する
- 必要に応じて `documents/design/index.md` の導線を確認する

## 非対象

- 実装コードの大規模変更
- Pose Landmarker の実測
- UI 追加
- WebRTC 契約変更

## 実装方針

1. 既存 `CharacterGaze` を `chat` 向け注視入力として再定義する。
2. `SincroFaceTracker` は `sincro` の名前を冠した顔同期本流として定義する。
3. `SincroPoseTracker` は将来拡張の optional module とし、採用前提ではなく性能検証後に有効化する。
4. `CharacterBehaviorState` は既存状態を維持しつつ、同期用 `faceMotion` / `poseMotion` snapshot を追加できる設計にする。
5. 生ランドマーク、正規化 motion snapshot、VRM retarget、最終ボーン・expression 適用の境界を図または箇条書きで明示する。

## 実装対象候補

- `documents/design/frontend_character.md`
- `documents/design/index.md`
- `documents/tasks/character_sincro_motion/open/TASK-3100-sincro-motion-foundation-epic.md`

## 完了条件

- `chat` と `sincro` の motion 設計差分が設計文書で説明されている。
- `SincroFaceTracker` と `SincroPoseTracker` の責務、依存、出力 snapshot が定義されている。
- FaceLandmarker / PoseLandmarker の採用段階と性能リスクが明記されている。
- 後続タスクが設計文書を参照して実装できる。
- 設計文書とタスクファイルの用語が揃っている。

## 確認観点

- 設計文書だけを読んで、`chat` は注視、`sincro` は同期であることが分かる。
- `CharacterGaze` に無理に同期責務を足さない方針が読み取れる。
- Pose Landmarker が optional であり、性能ゲート付きであることが明確である。

## 完了メモ

- 完了日: 2026-05-11
- 更新対象:
  - `documents/design/frontend_character.md`
- 確認結果:
  - `chat` と `sincro` の入力・状態・motion priority の違いを `6.1 chat と sincro のモーション責務境界` に整理した。
  - `SincroFaceTracker`、`SincroPoseTracker`、`TrackerRuntime`、retargeter の責務を `6.2 Sincro Motion パイプライン` と `7.1 コンポーネント設計` に定義した。
  - FaceLandmarker を顔同期の本流、PoseLandmarker を optional 上半身同期として位置づけ、性能ゲートと face-only fallback 方針を記載した。
  - WebRTC endpoint / JSON 契約は変更していない。
