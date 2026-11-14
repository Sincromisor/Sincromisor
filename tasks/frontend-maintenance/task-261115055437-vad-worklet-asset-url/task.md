# 音声Workletの配信URLをビルド生成へ移行する

## 背景 / 目的

優先度: 中。[音声WorkletのURL](../../../sincromisor-frontend/src/features/media/userMedia/userMediaAudioProfiles.ts)は固定パスと手動の版番号で管理され、処理変更時にURLだけ更新を忘れる余地がある。自作Workletをビルド対象のアセットとして扱い、内容変更を配信URLへ反映する。

## 変更範囲と方針

- [vad-processor.js](../../../sincromisor-frontend/src/features/media/vad/vad-processor.js)を `src/features/media/vad/` 配下へ移し、JavaScriptのままViteのURLインポートを用いる。処理本体やメッセージ形式は変えない。
- `userMediaAudioProfiles.ts` から `userMediaAudioProcessor.ts` の `audioWorklet.addModule()` へ渡すURLを生成物へ切り替える。小さいファイルでも独立URLとなるよう、必要ならインライン化を抑制する。
- [既存試験](../../../sincromisor-frontend/src/features/media/vad/__tests__/vadProcessor.test.js)の参照元を追従させ、手動版番号と不要になったpublic内の本体を除く。
- TypeScript化、Worklet処理の分割、音声ノードの所有権・開始終了の変更、MediaPipeなど外部配布素材の移設は含めない。既に開いているページへのWorkletの動的差し替えも対象外。

## 完了条件

- [x] 開発時と本番出力で `addModule()` が有効なJavaScriptのURLを読み込み、`vad-processor` の登録とノード生成が成功する。
- [x] 本番出力のWorklet URLが内容に応じて生成され、固定の日付クエリーを編集する必要がない。
- [x] 既存の音声処理・メッセージ試験が通り、旧publicファイルへの実行時参照が残らない。

## 確認方法

型検査、変更ファイルのBiome、`src/features/media/vad/__tests__/vadProcessor.test.js` と音声処理の影響する既存試験を実行する。開発サーバーと本番ビルドのプレビューで生成URLからWorkletを読み込み、短い合成音声でノード生成と処理を確認してAudioContextを閉じる。ブラウザー操作は[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。実マイク・RTC接続は不要。

## 文書同期

[音声パイプライン契約](../../../documents/design/contracts/audio-pipeline-websocket.md)の内容変更は不要。フロントエンドの音声設計・開発案内に旧Workletパスや版番号手順があれば更新する。

## 実施結果

Workletを `src/features/media/vad/vad-processor.js`へ移し、`?url&no-inline`によるViteのURLインポートへ切り替えた。処理本体は移動前とバイト単位で同一であり、固定パスと日付クエリーを除去した。試験の読み込み元も追従させた。

型検査、変更ファイルのBiome、音声関連6ファイル20試験、通常ビルドが成功した。Playwright CLIで開発・本番の両URLを読み込み、JavaScript応答、`vad-processor`の登録とノード生成、短い合成音声のVAD通知、AudioContextの終了を確認した。本番出力はハッシュ付き独立ファイルで、バンドル内の参照と配信ファイルの一致、旧publicファイルの不在を確認した。実マイク・RTC接続は使用していない。現在の音声設計・開発案内に旧パスや版番号手順はなく、履歴文書は維持した。コメント点検はPASS。
