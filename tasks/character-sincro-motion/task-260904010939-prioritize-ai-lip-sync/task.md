# キャラクター発話中はテロップ口形を優先する

## 背景 / 目的

`sincro` モードではカメラの顔追従が有効な間、`FaceMorphController` がカメラ由来の口形を常に優先する。このため、キャラクターが応答を発話している間も利用者の口元へ追従し、`telop_ch` の母音と発話時間に基づくリップシンクが適用されない。

ユーザー要求に基づき、キャラクターの発話中だけテロップ口形を優先し、それ以外は従来どおりカメラ口形へ追従させる。

## 完了条件（受け入れ条件）

- [x] カメラの顔追従が有効でも、キャラクター発話中は `telop_ch` の母音と長さに基づく口形を適用し、母音未着時もカメラ口形へ戻さない。
- [x] キャラクターが発話していない間は、従来どおりカメラ由来の口形を適用する。
- [x] 発話中と非発話時の優先順位を、`FaceMorphController` の単体テストで確認する。
- [x] 現在仕様を `documents/design/frontend/character/overview.md` と `documents/design/frontend/character/motion.md` に同期する。

## 設計判断

口形の競合を所有する `FaceMorphController.update()` だけで優先順位を切り替える。頭部、視線、まばたきのカメラ追従は継続し、発話中の口形だけをテロップ由来へ切り替える。

## スコープ境界

- 本タスクでは、カメラ口形とテロップ口形の優先順位、対応する単体テスト、設計文書を変更する。
- `telop_ch` の通信形式、音声合成、頭部・視線・まばたきの追従は変更しない。

## 実装方針

- `sincromisor-frontend/src/character/behavior/characterBehaviorStateDerivation.ts` で、`sincro` モードの AI リップシンクを許可する。
- `sincromisor-frontend/src/character/behavior/faceMorphController.ts` で、発話中の既存母音口形処理をカメラ口形処理より先に判定する。
- 新しい状態や設定は追加せず、既存の `aiSpeech.isSpeaking`、`currentMoraId`、`motionPolicy` を再利用する。

## テスト

- `cd sincromisor-frontend && npm run test -- faceMorphController`
- `cd sincromisor-frontend && npm run check:biome`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。キャラクターの口形優先順位という利用者向け挙動が変わるため、`documents/design/frontend/character/overview.md` と `documents/design/frontend/character/motion.md` を同期する。WebRTC の通信契約は変更しない。
