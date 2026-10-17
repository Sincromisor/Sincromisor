# 音声合成の同期処理をイベントループから分離する

## 背景 / 目的

VoiceSynthesizerWorker.communicateは同期のget_voiceを直接呼ぶ。Redis・S3・VOICEVOXとOpus変換の待機中に、同一プロセスのWebSocketや状態確認も止まる。音声処理の内容を保って待機の影響を分離する。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 先行タスク

- [task.md](../../../tasks/backend/task-261017195943-voicevox-http-session/task.md)（VOICEVOXのHTTP接続を再利用し要求待ちを制限する）

## 変更範囲

- [VoiceSynthesizerWorker.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizerWorker.py)
- [VoiceCacheManager.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceCacheManager.py)
- [VoiceSynthesizerProcess.py](../../../sincromisor-server/voice-synthesizer/VoiceSynthesizerProcess.py)
- [audio_encoder.py](../../../sincromisor-server/sincro-models/src/sincro_models/audio_encoder.py)

## 設計判断

- 同期のget_voice単位を実行スレッドへ委ね、WebSocket送受信と結果のspeech_id付替えはイベントループ側に残す。同一接続では一要求ずつ完了を待ち、先読みや無制限のジョブ投入を追加しない。
- 接続所有のクライアントは処理中に閉じない。親処理の取消と同期処理の停止は別であるため、取消後も実行中処理を回収してから資源を解放し、結果を閉じた接続へ送らない。
- Redis・S3の実効タイムアウトと外部コマンドの終了条件を確認する。無期限の待機が残る境界だけ、この合成経路に限って有限にする。共有encode_audioを変える場合は認識音声保存の呼出元も確認する。
- キャッシュの取得順・保存失敗時の継続・破損時の例外・ログの秘匿を維持する。接続先と資格情報の供給元は既存ProcessとConsulのままとする。

## 完了条件と確認方法

- [x] 同期処理を試験用イベントで待たせた間にも、同じイベントループの別コルーチンが進む。
- [x] 成功・生成失敗・親取消の試験で、同一要求の重複実行、終了前のクライアントclose、取消後の送信がない。
- [x] 実際のWorkerをローカルWebSocket経由で呼び、遅延させた接続先と切断を使って終了処理を確認する。既存音声合成の診断・ログ試験を通す。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

認識・分類の非同期化、キュー基盤の共通化、Opusの省略、WAVへの切替、性能の固定目標や本番VPSでの負荷試験。

## 文書と契約

[voice-synthesizer.md](../../../documents/design/backend/services/voice-synthesizer.md)に変更後の所有者と処理の流れを反映する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [同期I/Oをイベントループ外で実行する方法](https://docs.python.org/3.14/library/asyncio-task.html#asyncio.to_thread)。

## 実装・確認結果

get_voiceを一要求ずつasyncio.to_threadへ渡し、取消が重なっても実処理を回収してからProcessのcloseへ戻るようにした。送受信・speech_id付替えはイベントループに残し、取消後は送信しない。ExitStackで合成Session・S3・Redisを逆順に解放し、構築途中の失敗も回収する。Redisの無期限待機を接続5秒・読取30秒・再試行なしへ変更した。S3は採用版の接続・読取60秒とlegacyの有限再試行を確認し既存値を維持した。外部変換は先行した認識直列実行タスクで追加済みの30秒制限を使う。イベントによる成功・失敗・重複取消、実WorkerとローカルWebSocket・遅延HTTP・実Opus変換の成功および切断時取消、既存ログ・診断・モデル互換・外部変換を含む38試験がPASS。Go互換試験はDockerへ既存Goモジュールキャッシュを読取専用で渡した。Ruff・ty・Markdown整形はPASS（既存CamelCaseファイル名N999を除外）。コメント点検: PASS（同期処理と接続資源の所有、取消時の回収、有限待機を点検）。先読みしないため通常の切断検出は次のWebSocket入出力時となる。
