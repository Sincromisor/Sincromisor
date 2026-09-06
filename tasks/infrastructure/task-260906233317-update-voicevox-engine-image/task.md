# VOICEVOXを0.25.2へ更新し配布物の取得処理を修正する

## 背景 / 目的

2026-09-06、HEAD `5bc93dcb1130fe339e4e114a7c2294dd97497463` の
[Dockerfile](../../../Docker/voicevox/Dockerfile)は `VOICEVOX_VERSION=0.24.1`。
[公式安定版0.25.2](https://github.com/VOICEVOX/voicevox_engine/releases/tag/0.25.2)が公開されている。
[0.25.0](https://github.com/VOICEVOX/voicevox_engine/releases/tag/0.25.0)には既定スレッド数決定方法の変更もあるため、CPU版の動作を確認する。
ユーザーの更新要求を根拠に、CPU/x64構成のまま安定版へ更新する。

現行は `curl -L` でキャッシュの確定名へ直接保存し、存在だけで再利用する。
中断後の不完全なファイルが次回ビルドにも残るため、取得失敗から再試行できるようにする。

## 完了条件（受け入れ条件）

- [x] 0.25.2のLinux CPU/x64配布物でビルドでき、`/version` が0.25.2を返す。
- [x] HTTPエラーや中断による不完全ファイルを正常キャッシュとして残さず、失敗確認を1件残す。
- [x] スタイルID 0の日本語短文で `/audio_query` と `/synthesis` が成功し、既存消費側でWAVと口形同期用情報を扱える。
- [x] Consul登録とComposeの死活確認が維持される。

## 実装方針 / スコープ境界

主対象はDockerfile。必要な場合だけ [起動処理](../../../Docker/voicevox/start-voicevox.sh) と
[Compose](../../../compose/voice-synthesizer.yml)を更新する。
配布ファイル一覧を確認しCPU版に必要な巻だけを取得する。将来の形式への汎用対応は作らない。
`curl --fail` と一時ファイルからの移動など、既存の道具で取得処理を修正する。
Ubuntu 24.04、実行ユーザー、CPU実行、ポート50021を維持し、GPU版や開発版の採用は含めない。

## テスト

空キャッシュと再利用キャッシュでビルドを確認し、不完全キャッシュが残らないことを確認する。
一時コンテナで版、話者一覧、日本語短文1件の合成を確認する。
消費側は `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/` の
`VoiceVox.py` と `VoiceSynthesizer.py`。稼働サービスの置換や負荷試験は含めない。

## 文書同期 / 調査記録

[音声合成設計](../../../documents/design/backend/services/voice-synthesizer.md)と
[Compose設計](../../../documents/design/infrastructure/compose.md)の導線を確認し、変更した運用事項を同期する。
起票時は定義と公式情報のみ確認した。配布物の取得・展開・更新版の合成は未実行。

## 実行結果

通常変更として親が現在の作業ツリーで実装した。配布一覧でCPU/x64の7zは `.001` だけと確認した。
`docker build -f Docker/voicevox/Dockerfile -t sincro-task:voicevox .` が成功した。
一時Dockerfileで取得・展開段階を再実行し、キャッシュ再利用時も展開が成功した。
取得の失敗確認は `python3 tasks/infrastructure/task-260906233317-update-voicevox-engine-image/artifacts/check_download.py` で再現できる。
HTTP 503時の未確定ファイル除去、次回成功、確定済みキャッシュの再利用を確認した。

一時ネットワーク `sincro-task-net` にConsulとVOICEVOXを起動し、`/version` が `0.25.2`、
Consulの `SincroVoiceVox` 登録、話者一覧のスタイルID 0を確認した。
既存 `VoiceSynthesizer.generate` に発話ID 1、スタイルID 0、日本語短文、`audio/wav` を渡し、
24,000Hz・57,856フレームのWAV、19件のモーラ、約2.41秒の発話時間を確認した。
稼働サービスの置換は行っていない。文書・コメント点検はPASS。既知の残リスクはない。
