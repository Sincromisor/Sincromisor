# 評価: task-261011233441-rtc-playback-mode

## 判定

PASS

## 根拠

- `talk_mode=playback`をフロントの選択、保存・URL復元、初回Offer、ICE再接続からRTCのセッション作成まで伝播する。playbackは素材を遅延共有読み込みし、Coordinatorを作らず、入力RTPは消費して破棄する。通常の`chat`／`sincro`／`echo`の作成経路は維持する。
- 既定のOgg Opusと合成結果JSONを追加し、素材読込は形式・必須項目・モーラ時刻・PCM長を既存Decoderで検証する。成功だけを共有キャッシュし、各セッションは1件だけを待ち行列に入れて周回ごとに`speech_id`を更新する。実配布素材を使うPion試験は2周以上の非無音音声、本文1回、テロップの先頭時刻、連続RTP時計、複数セッションの終了分離を確認している。
- 素材不良はHTTP 422とフロントの固定案内へ変換し、下流や代替音声へ進まない。playbackの旧周回・過去時刻をフロントで破棄する試験、保存・Offer伝播・失敗表示の試験がある。`npm run gate`は685件成功、3件skipで通過している。
- Playwright CLIによる実ブラウザー確認では、メニューからplaybackを選択して初回Offer、3周以上の非無音返却音声、本文1回、`speech_id` 1〜3と各周回先頭時刻0、口形描画、停止後のPeerConnection終了と再接続を確認している。下流・Consulは起動していない。
- Dockerfileは実行時の作業ディレクトリに`assets/playback/default/`を配置する。README、RTC契約、RTCサービス設計、ページ、VAD、共通枠組みを更新し、値追加を破壊的変更として明記している。MarkdownはPrettier確認済みで、変更した境界・生存期間・診断分岐のコメントも実装と一致する。

## 残課題

- なし
