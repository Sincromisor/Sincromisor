# VOICEVOXのHTTP接続を再利用し要求待ちを制限する

## 背景 / 目的

VoiceVoxは各APIでrequests.post/getを直接呼び、接続を再利用せず、タイムアウトも指定していない。音声合成処理を別スレッドへ移す前に、HTTPクライアントの所有者と終了条件を定める。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [VoiceVox.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceVox.py)
- [VoiceSynthesizer.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizer.py)
- [VoiceCacheManager.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceCacheManager.py)
- [VoiceSynthesizerWorker.py](../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizerWorker.py)
- [VoiceSynthesizerProcess.py](../../../sincromisor-server/voice-synthesizer/VoiceSynthesizerProcess.py)

## 設計判断

- VoiceVoxインスタンスがrequests.Sessionを一つ所有し、同じWebSocketの連続要求で再利用する。全接続で共有するグローバルSessionは導入しない。
- WebSocket終了時にWorkerからCacheManager、VoiceSynthesizerへ終了処理を伝える。初期化途中の失敗でも作成済みSessionを解放する。
- 接続・読取りタイムアウトを指定する。値は現在のGo側待機上限とVOICEVOXの開発環境での合成時間を確認して決め、値と根拠をタスクへ記録する。新しい環境変数は設けない。
- 接続先は従来どおりConsulからProcessへ渡す。HTTP状態だけを伝えるProtocolErrorと本文・URLを記録しない診断を維持する。

## 完了条件と確認方法

- [ ] 同じWorkerの2要求が一つのSessionを使い、正常終了・途中失敗のいずれでもSessionが閉じられる。
- [ ] HTTPの非成功・タイムアウトが従来の失敗経路へ伝わり、合成を自動で再試行しない。
- [ ] ローカルのHTTP/1.1試験サーバーで持続接続の再利用と読取りタイムアウトを確認する。既存test_runtime_diagnostics.pyとtest_synthesis_logging.pyの関連試験を通す。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

同期処理のスレッド移行、Redis/S3の全体共通化、音声形式・キャッシュキー・通信契約の変更。自宅ワーカーとVPS間の帯域を抑えるOpus転送を維持する。

## 文書と契約

[voice-synthesizer.md](../../../documents/design/backend/services/voice-synthesizer.md)に変更後の所有者と処理の流れを反映する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [Sessionの接続再利用とタイムアウト](https://requests.readthedocs.io/en/latest/user/advanced/)。
