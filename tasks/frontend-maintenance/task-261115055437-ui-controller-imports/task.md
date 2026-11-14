# 画面と購読フックを軽量なアプリ参照窓口へ移行する

## 背景 / 目的

優先度: 高。[有効アプリの参照と購読を軽量な窓口へ分離する](../task-261115055437-active-controller-access/task.md) の完了後、UIの現在値取得・購読を軽量な窓口へ移し、表示の変更や単体テストでアプリ全体を読み込む依存を減らす。

## 変更範囲と方針

- `src/app/react/`、`src/app/settings/react/`、`src/app/shell/` と `src/features/{conversation,dialog,debug}/react/` の有効アプリ参照・購読箇所を対象にする。変更前に `getCurrent`、`subscribeCurrent`、`subscribeActiveSincroAppController` の利用箇所を確認する。
- [設定購読フック](../../../sincromisor-frontend/src/app/react/useSincroAppControllerSettingsState.ts)、[イベント購読](../../../sincromisor-frontend/src/app/react/subscribeActiveSincroAppEvents.ts)、[会話購読](../../../sincromisor-frontend/src/features/conversation/chat/react/useChatSnapshot.ts)から順に直接参照へ切り替える。
- 型は `import type` を維持し、実体の取得・購読は再エクスポート窓口 `app/controller/index.ts` を経由しない。購読先から得たControllerの操作は従来どおり呼ぶ。
- 起動処理でのController生成は維持する。現在値取得だけに使う起動失敗時の参照も移し、全利用箇所の移行後に不要な静的取得・購読APIと再公開を削除する。
- 既存テストのモックを新しい境界へ合わせ、画面の状態・操作・設定値を変えない。一般的な相対パスの書き換えや別名導入、全機能の構造変更は行わない。

## 完了条件

- [x] 取得・購読だけを行うUIとフックが、Controller本体やそれを再公開する窓口を値としてインポートしない。
- [x] 初期値表示、有効アプリの差し替え、旧購読解除、チャット更新と設定操作を維持する。
- [x] 不要になった旧取得・購読APIに実行時の呼び出しが残らない。型専用参照と起動時の生成は区別する。

## 確認方法

フロントエンドの型検査、変更ファイルのBiome、Controllerの購読試験、`src/features/conversation/chat/react/__tests__/sincroChatView.test.tsx` と変更した設定表示の既存試験を行う。`subscribeActiveSincroAppEvents.ts` と `useChatSnapshot.ts` の型専用参照を除く依存経路を追い、Controller本体への到達がなくなったことを確認する。全画面のブラウザー試験は必須にしない。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)のReactからの参照方法と旧APIの削除を同期する。公開通信・保存契約は変えない。

## 実施結果

UI・購読フックと起動失敗処理を軽量な取得・購読モジュールへ直接接続した。生成側と型専用参照を維持し、旧静的取得・購読APIと購読関数の再公開を削除した。モックとモジュール初期化を伴う既存試験も新しい境界へ合わせた。

- 型検査、変更22ファイルのBiome、対象17ファイル76試験が成功した。Controllerの差し替え・解除、設定通知・保存・較正操作、会話・テロップの初期表示、3ページの手動・OBS開始とVRM復元を確認した。
- `subscribeActiveSincroAppEvents`、`useChatSnapshot`、設定購読フックをController本体・実行時生成への読み込みを拒否する試験から読み込み、依存の切断を確認した。静的取得・購読APIの残存呼び出しはない。
- 共通枠組みの設計を同期し、変更箇所と直接関係するコメントを点検した。全画面ブラウザー試験は本タスクの必須確認に含めない。

後続の遅延配置確認で、ブラウザー試験に残っていた旧静的取得APIも移行した。`src`と `tests`を含むフロントエンド全体に旧APIの実行時呼び出しがないことを確認し、対象UI30件・起動7件のブラウザー確認も完了した。
