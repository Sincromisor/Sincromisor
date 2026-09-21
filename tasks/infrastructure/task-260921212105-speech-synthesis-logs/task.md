# 音声生成ログの構造化と記録切替を実装する

## 背景と目的

音声生成ログをデフォルトで残し、`.env`から無効化する。
現在の`VoiceSynthesizerWorker`と`VoiceCacheManager`は本文を出し、`VoiceVox`の要求URLと例外にも本文が含まれ得る。
[Python共通出力](../task-260921212105-python-conversation-logs/task.md)と[収集設定](../task-260921212104-vector-host-collection/task.md)を利用し、[内容記録の仕様](../task-260921212053-victorialogs-foundation/task.md#内容を記録する設定)に従う。

## 変更範囲と方針

- `SINCRO_LOG_SYNTHESIS_ENABLED`を引数・環境設定、`examples/compose.env`、`compose/voice-synthesizer.yml`へ追加する。未指定・`true`で有効、`false`で無効、不正値は拒否する。
- `VoiceSynthesizerWorker.py`、`VoiceCacheManager.py`、`VoiceVox.py`と呼出し元を対象に、受信全体の`repr`を構造付きイベントへ置き換える。
- 有効時は読み上げ本文、実際に指定した話者・スタイル・音声形式・生成パラメーター、要求と結果、キャッシュ命中、処理時間を記録する。音声本体はJSONLへ入れない。
- `session_id`、`speech_id`、保持している`sequence_id`を処理境界で付ける。内部ID受渡しを必要範囲へ限定し、msgpack契約を変更しない。
- 失敗を成功と区別し、内容ログが無効でも本文なしの失敗理由を残す。
- 無効時はキャッシュ層、HTTP例外、VOICEVOXアクセスログのURL中の`text`とURLエンコードされた本文も確認する。自前出力元で抑止し、第三者サービスは公式設定またはVectorで対象項目を除去する。
- 収集側で除去する場合は元本文を代替項目へ複製せず、必要な設定をVectorへ渡す。中央だけで除去する場合のローカル原本の扱いを明示する。

## 完了条件

- [x] 未指定・有効時に本文と生成条件・結果を構造付きで読め、キャッシュ利用と失敗を判別できる。
- [x] 無効時は詳細イベントを止め、自前サービスの運用ログへ本文を残さない。VOICEVOXログも中央から本文を抽出できない。
- [x] 対話ログとの独立性を確認する。対話が無効・音声生成が有効なら本文は残り、その逆では音声生成の詳細を止める。
- [x] 音声生成・応答・RedisとS3のキャッシュを設定で変えず、認証情報を常に記録しない。

## 確認方法と文書同期

既存テストとHTTP代役で成功・失敗・キャッシュ利用、有効・無効を確認する。
固定したVOICEVOXコンテナのアクセスログを人工的な本文で一度確認し、抑止・除去設定を検証する。
Ruff、対象テスト、Compose受渡しを確認する。音声品質評価は追加しない。
`documents/design/infrastructure/logging.md`、`backend/services/voice-synthesizer.md`、必要な`infrastructure/storage.md`と設定サンプルを同期する。

## 対象外

音声バイナリの新規アーカイブ、既存キャッシュ・認識音声保存の停止や削除は行わない。
この設定は詳細ログの切替であり、一般の運用ログや音声機能の停止ではない。

## 実装と確認結果

2026-09-22、音声生成の詳細を共通JSONLへ統合し、独立した設定をPythonとVectorへ渡した。
要求・結果はキャッシュ管理の共有境界で記録し、ワーカーが会話・発話・シーケンスIDを渡す。
失敗時は例外型・HTTP状態だけを残す。既存のキャッシュキー、保存順序、MessagePackは維持した。

- 対象pytest: 18件PASS。対話／合成の4組合せ、実HTTP代役、WAV生成、Redis・S3命中、HTTP 503、ワーカーのIDと空の確定通知、不正設定、共通JSONLを確認した。
- Vector 0.58.0: 有効・無効それぞれ4件PASS。VOICEVOXの人工本文による実アクセス行を固定テストへ収録し、イベント全体からURLエンコード本文が消えることを確認した。
- VOICEVOX ENGINE 0.25.2、ローカルイメージID `sha256:dce5d79a6355e4e48703b77505d916992e17c577c042dd6c9fc2184607d64ba1`: ネットワーク隔離コンテナ内で人工本文のaudio_queryが200、DockerログにURLエンコード本文が出ることを実測した。確認用コンテナは削除済み。
- Compose構成検証、対象ty、Markdown整形、差分空白確認はPASS。Ruffは既存のモジュール名N999とRedis取得のSIM102のみで、新規診断なし。
- 先行Vectorタスクの全体ゲートでは変更前からのMarkdown整形不整合が残る。フロントのビルド・テストは同タスクでPASS済みで、今回フロント実装は変更していない。

変更シンボルと直接の理解範囲のコメントを点検し、共有の切替、HTTP例外、キャッシュの動作維持、ID受渡しを補足した。
中央で除去するVOICEVOX本文はDocker原本には回転まで残る。この制限をログ設計へ明記した。
複数ホストの最終確認は依存先の結合確認タスクで行う。
