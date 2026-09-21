# レビュー: task-260921221013-browser-diagnostic-logs

## 判定

APPROVED

## 理由・申し送り

- 現在の`frontendLogger`はconsoleだけで、`UserMediaManager`、RTC signaling、VRM初期化、VAD Worker、Tracker Workerの失敗は中央へ届かない。Caddyの`/api/v1/RTCSignalingServer/*`同一オリジン経路とRTCの`internal/signaling.Server`は、専用の外部公開や保存先を増やさず受信境界を追加できる既存構成である。
- 診断APIは既存のsignaling APIと別の固定パス・JSONスキーマ・成功応答を契約化し、HTTPメソッド、必須/任意項目、単一イベントの上限、バッチ件数、端末側時刻と受信時刻を明示する。`Server.Handler()`へ登録して既存の未知API 404、body上限、panic境界、JSON応答を保ち、Caddyは同一のRTC reverse proxyだけを通す。VectorやVictoriaLogsのURL・認証情報をブラウザーへ出さない。
- 受信側は`host`、`project`、`service`、container ID、受信時刻をサーバー・収集側だけで決め、ブラウザーの申告値で上書きさせない。端末IDと発生時刻は別名の診断属性として扱い、`session_id`は取得できる厳格形式の相関ヒントだけを受ける。セッション前の失敗はIDなしで記録し、存在しないIDや端末申告からサーバー側の所有者・配置ホストを推測しない。
- `LogContext`は現在任意の`Record<string, unknown>`をconsoleへ渡せるため、送信用には同じ任意contextを転送せず、イベント種別ごとの許可項目へ縮小する。エラーmessage、stack、URL、device label、RTC candidate、SDP、DataChannel本文、MediaPipeの入力・推論結果、トークン・ヘッダーを送らない。本文記録の無効化はクライアントの任意フラグで解除できず、サーバーも受信JSONの任意本文を運用ログへ文字列化しない。
- 端末側の送信は本体処理と切り離した有限待ち行列とし、送信中・再試行中のイベント数、送信失敗、容量破棄を観測する。APIの失敗やofflineを同じ待ち行列へ再帰追加せず、tab終了・ブラウザー強制終了・queue上限超過では未送信が残り得ることを設計へ記す。診断受付の失敗を会話開始、MediaStream取得、RTC再接続、描画回復の失敗へ変換しない。
- `learnedVadWorkerClient`と`SincroTrackerWorkerClient`は、Worker起動、`loading`/`ready`/`unavailable`、`onerror`、fallback、復旧を既存の状態通知で受ける。毎フレームの確率・画像・姿勢・推論内容を送らず、状態変化と安全な失敗分類だけを有限に記録する。マイク/カメラ拒否・トラック終了、RTC状態、WebGL context loss、未処理例外も同じ入口へ集め、回復可能な経路は回復イベントを残す。
- 不正・過大入力、受付停止、Worker失敗、会話前後の各代表例を境界テストとPlaywrightで確認する方法がある。既存RTCシグナリング・DataChannel・会話履歴を変えず、保存対象と未送信の限界をフロント契約・app shell・ログ設計へ同期するため、完了条件は一意に検証可能である。

## 自律補完

- `AUTO_FIX`: ブラウザーから送る診断は`event`、安全な`reason_code`、端末発生時刻、任意の厳格な`session_id`、状態・回数・有限の数値だけにする。任意`context`・例外文字列の転送を許さないことで、内容記録の無効化と認証秘匿の共通契約を満たす。
- `AUTO_FIX`: 同じ障害の連続送信はクライアントの有限待ち行列で合流または件数化し、状態遷移と回復を優先する。イベントごとの無制限再送、永続ブラウザー保存、バックグラウンド同期は要求されていないため追加しない。
- `AUTO_FIX`: Caddyの既存RTC wildcardが新しい固定受付パスを同一オリジンで転送できる場合は、挙動を変えない設定差分を追加しない。契約・テスト・設計にはその経路を明記する。
