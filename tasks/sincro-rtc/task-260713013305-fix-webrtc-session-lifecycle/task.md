# WebRTCセッション管理の停止耐性と音声フレーム処理を修正する

## 背景 / 目的

`sincro-rtc` のコードレビューで、セッション確立・終了・音声縮退処理に次の不具合要因が見つかった。

- 親プロセスが子プロセスからの `Pipe.recv()` をロック保持中に無期限で待つため、子プロセスが応答不能に
  なると Offer、candidate、cleanup、shutdown が連鎖的に停止する。
- RTC 終了時に `VoiceTransformTrack` が所有する `AudioBroker` の WebSocket と非 daemon thread が
  明示解放されず、子プロセスが管理スレッドによる強制終了まで残留し得る。
- `SINCRO_RTC_MAX_SESSIONS` 件ちょうどの状態でも新規セッションをもう1件作成できる。
- AudioBroker 障害時の無音フレームが stereo / 48 kHz 固定で、mono 等の入力では変換失敗から
  RTC セッション終了へ波及し得る。

1 session = 1 process という既存設計と HTTP / WebRTC 契約を維持したまま、これらを修正し、異常系と
境界条件を自動テストで固定する。設計正本は
`documents/design/backend/services/sincro-rtc.md` と
`documents/design/contracts/frontend-rtc.md` である。

## 完了条件（受け入れ条件）

- [ ] 初回 Offer と更新 Offer の子プロセス応答が15秒以内に届かない場合、親は待機を終了し、対象子プロセスを
  終了・join・closeして管理辞書から除去する。初回 Offer は既存契約どおり HTTP 503、更新 Offer は既存の
  fallback 方針どおり新規作成を試み、他の `/statuses`、`/candidate`、`/cleanup`、shutdown はその後も処理できる。
- [ ] `/offer` のブロッキングなプロセス生成・Pipe通信は FastAPI イベントループ上で直接実行せず、同期
  endpoint として thread pool で実行する。`/candidate` 等の別リクエストがイベントループへ受理されることを
  テストまたは FastAPI の endpoint 定義検査で確認する。Manager のロックにより同一プロセスのシグナリングを
  直列化する既存制約は維持する。
- [ ] 既存セッションの更新は上限到達時にも許可する一方、新規作成は現在数が `max_sessions` 以上なら原子的に
  拒否し、HTTP 429 と `{"error":"Too many requests."}` を返す。上限 `0`、上限ちょうど、上限未満、更新 Offer、
  更新失敗後の新規 fallback の各分岐をテストする。
- [ ] RTC セッションの正常終了・failed・初期化途中の失敗の各経路で、生成済み `VoiceTransformTrack.stop()` が
  `AudioBroker.close()` をちょうど1回実行し、WebSocket/通信 thread の終了処理を通る。複数回 stop/close しても
  例外や二重 close を起こさない。
- [ ] 管理スレッドは `Process.join(timeout)` の戻り値ではなく `Process.is_alive()` でタイムアウトを判定し、
  時間内に終了したプロセスを kill せず、時間超過したプロセスだけを kill・join・closeする。
- [ ] AudioBroker が利用不能な縮退経路で生成する無音フレームは、入力 `AudioFrame` の format、layout、samples、
  sample_rate、pts、time_base を維持する。少なくとも mono/stereo と 16 kHz/48 kHz の組合せを単体テストし、
  無音であることと RTC finalize event が立たないことを確認する。
- [ ] 追加・変更する public class / method、および timeout・cleanup・frame変換という非自明な lifecycle 判断の
  コメントを `documents/rules/coding-py.md` と `AGENTS.md` のコメント品質基準で監査する。名前・型から明らかな
  説明は削除し、所有権、失敗条件、不変条件だけを日本語 docstring/comment として残し、stale comment を残さない。
- [ ] `uv run ruff check .`、`uv run ruff format --check .`、
  `uv run --group dev --group full ty check .`、対象 pytest、`npm run gate` が成功する。

## 設計判断（着手前に確定済み）

- 応答待ち timeout は `RTCSessionManager` の private class constant `SIGNAL_RESPONSE_TIMEOUT_SECONDS = 15.0`
  とする。環境変数にはしない。これは障害からの復帰上限であり運用調整値ではなく、設定面を増やす必要がないため。
- `multiprocessing.Connection.recv()` を直接呼ばず、`poll(15.0)` 成功後だけ `recv()` する。timeout、EOF、broken
  pipe、子プロセス死亡は同じ「シグナリング子プロセス失敗」として cleanup し、ログには session ID と失敗種別を
  残す。生の SDP、credential、会話内容は追加でログ出力しない。
- `sincro_rtc/RTCSession/Exceptions.py` に `RTCSessionError` を基底として、最小限
  `RTCSessionCapacityError` と `RTCSessionResponseTimeoutError` を定義する。HTTP 層は capacity のみ429へ変換し、
  その他の初回確立失敗は503へ変換する。文字列や `None` で失敗種別を表す案は呼出側の分岐漏れを招くため採らない。
- `RTCSessionManager.create_or_update_session` に keyword-only `max_sessions: int` を渡し、Manager がロック取得後に
  「既存 active session の更新」を先に判定する。新規作成へ進む直前に `len(__processes) >= max_sessions` を評価し、
  capacity error を送出する。HTTP 層で count と create を分ける方式は競合可能なため廃止する。
- `/offer` は `async def` の中から thread helper を呼ぶ形ではなく、FastAPI の同期 `def` endpoint に変更する。
  FastAPI/Starlette の thread pool 境界を利用し、独自 executor は導入しない。
- `VoiceTransformTrack` は生成した `AudioBroker` の所有者とし、`stop()` を overrideして、idempotent guardの下で
  `AudioBroker.close()` 後に `super().stop()` を呼ぶ。`RTCVoiceChatSession` は引き続き MediaStreamTrack 標準の
  `stop()` だけを呼ぶ。モデルから具象 track 型を参照する案は循環依存と所有権逆転を招くため採らない。
- 無音化は入力 `AudioFrame.to_ndarray()` と同じ shape の `numpy.zeros_like` を使い、
  `AudioFrame.from_ndarray(..., format=frame.format.name, layout=frame.layout.name)` で再構築して、sample_rate、pts、
  time_base をコピーする。stereo/48 kHz への固定変換は WebRTC negotiation と矛盾するため廃止する。
- 新規の外部payload/schemaは導入しない。既存 Offer/Candidate の Pydantic model とHTTPレスポンスを維持する。

## スコープ境界

本タスクには `RTCSignalingServer`、session manager/process lifecycle、track終了、無音フレーム変換、および
それらの単体・endpointテストを含む。4件は「セッションが確立・縮退・終了でき、設定上限を守る」という同一の
運用信頼性変更束として扱う。依存タスクはない。

次はスコープ外とする。

- frontend の再接続ロジック、Offer/Candidate/DataChannel のpayload変更
- AudioBroker のワーカー選択、再接続アルゴリズム、各downstream serviceの変更
- 1 session = 1 process 設計の変更、async IPCや共有process poolへの移行
- CORS、認証、ログ全般の整理、既存 SDP/header ログのprivacy改善
- 音声codec、channel数、sample rateを特定値へ再negotiationする機能追加

## 実装方針（既存コード整合: file:line）

- `sincromisor-server/sincro-rtc/RTCSignalingServer.py:89-118`: `/offer` は async endpoint 内で同期的に
  `create_or_update_session` を呼び、93行目の `>` 判定は上限を1件超えて許可する。同期 endpoint化し、capacity
  exceptionを429へ、その他を503へ変換する。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionManager.py:42-75`: 更新可否と新規fallbackを
  Manager lock内で決めている。この構造に上限判定を統合し、active session更新は上限判定より先に行う。
- 同 `:77-122` と `:124-175`: 初回・更新とも `Connection.recv()` がtimeoutなし。共通のprivate受信helperと
  session cleanup helperへ集約し、timeout/error時にもprocess descriptionとpipeを回収する。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionProcessDescription.py:15-21`: closeはevent設定、
  management thread join、pipe closeを担う。timeout cleanupで再利用し、close自体も複数回呼べるようにする。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionProcessManagementThread.py:27-36`:
  `Process.join()` は常に `None` を返すため現状は必ずkill分岐へ入る。join後の `is_alive()` 判定へ変更する。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/models/RTCVoiceChatSession.py:35-45`: session closeはtrackの標準
  `stop()` を呼ぶ。この契約を維持し、具象track側のstopへ所有資源解放を実装する。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/VoiceTransformTrack.py:161-205`: 無音フレームは
  stereo/48 kHz固定で、明示的な `close()` だけがAudioBrokerを閉じる。入力属性維持とidempotent stopへ変更する。
- テストは規約どおり `sincromisor-server/sincro-rtc/tests/` に `test_rtc_session_manager.py`、
  `test_rtc_session_process_management_thread.py`、`test_voice_transform_track.py`、必要なら
  `test_rtc_signaling_server.py` を置く。外部Consul、TURN、WebSocket、音声deviceへ接続せずmock/fakeで完結させる。

## テスト

- Managerテスト: fake Connection/ProcessDescriptionを用い、15秒値を実時間待機せず `poll()` の引数と
  timeout/error cleanupを検証する。初回timeout、更新timeout、EOF、正常応答後の辞書保持を分岐ごとに確認する。
- capacityテスト: 0件上限、`max-1`、`max`、active session更新、更新拒否後fallbackを検証し、上限拒否時に
  子プロセスを生成しないことを確認する。
- management threadテスト: join後にdeadならkill 0回、aliveならkill/join/close各1回であることを確認する。
- trackテスト: fake AudioBrokerとmono/stereo、16 kHz/48 kHzのPyAV frameで、stopの冪等性、無音値、format、layout、
  samples、sample_rate、pts、time_baseの一致を確認する。AudioBroker不稼働時にもfinalize eventはunsetとする。
- endpointテスト: capacity exceptionが429、session timeout等が503、成功時schemaが不変であること、および `/offer`
  endpointが同期関数として登録されることを確認する。
- package確認として `uv run pytest sincromisor-server/sincro-rtc/tests` を実行する。続けてPython規約のRuff、format、
  tyとrepository標準の `npm run gate` を実行し、未実行項目があれば理由と残リスクを `impl.md` に記録する。

## ドキュメント同期の要否

HTTP endpoint path、JSON schema、DataChannel、media契約は変更しないため
`documents/design/contracts/frontend-rtc.md` の契約更新は不要である。一方、timeout、上限制御、正常終了時の資源解放は
backendの公開運用挙動なので、`documents/design/backend/services/sincro-rtc.md` の Observability / Failure Modes と
Change Checklistへ「Offer子プロセス応答は15秒で失敗・回収」「上限到達時は既存更新のみ許可」「track stopが
AudioBroker資源を解放」を同期することを完了条件とする。公開バレルや生成物の変更はない。
