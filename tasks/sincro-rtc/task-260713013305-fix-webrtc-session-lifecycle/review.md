# Review: task-260713013305-fix-webrtc-session-lifecycle

## 判定

APPROVED

Critical / High の阻害事項はない。受け入れ条件は異常系・境界条件まで検証可能で、主要な設計判断、変更箇所、
テスト方法、設計文書の同期先が着手前に確定しているため、実装へ進めてよい。

## 指摘事項

- [Medium] 更新失敗後の fallback テストでは、`poll()` timeout / EOF / broken pipe / 子プロセス死亡のように
  旧セッションを回収する失敗と、子プロセスが返す `update_offer_error` のように旧セッションが active のままの
  拒否を分けて検証すること。前者は回収後の件数で新規作成可否を判定し、後者は上限到達中なら fallback の新規
  process を生成せず 429 にする、という期待値は設計判断を組み合わせれば一意に読めるが、テスト名と fixture を
  分けないと境界分岐を取り違えやすい。
- [Low] 初回 Offer が `offer_error` payload を返した場合も、HTTP 503 を返した後に管理辞書から終了済み session が
  回収可能であることを確認するとよい。15秒 timeout の必須条件とは別経路だが、現行コードでは response 受信後の
  `RuntimeError` と process cleanup が分離しているため、回帰検出に有用である。

## 確認した根拠

- `tasks/AUTHORING-CHECKLIST.md` の要件明確性、設計判断、`file:line` 整合、スコープ、テスト可能性、文書同期の
  各観点と照合した。上限 `0` / 未満 / ちょうど / active 更新 / fallback、初回・更新 timeout、正常終了・failed・
  初期化途中失敗、mono/stereo と 16/48 kHz が明示されている。
- `sincromisor-server/sincro-rtc/RTCSignalingServer.py:82-126` で `/offer` が `async def` のまま同期 manager を呼び、
  上限判定が `>` であることを確認した。同期 endpoint 化、例外ごとの 429 / 503、endpoint 定義検査という方針は
  現行構造と整合する。
- `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionManager.py:42-153` で manager lock 内の
  update-first / create fallback と、初回・更新双方の timeout 無し `recv()` を確認した。lock 内 capacity 判定と
  `poll(15.0)` 後だけ `recv()` する方針は競合と無期限停止の両方を対象にしている。
- `RTCSessionProcessDescription.py:15-21` と `RTCSessionProcessManagementThread.py:27-36` で、description の
  finalize / thread join / pipe close、および `Process.join()` の戻り値を誤用した kill 判定を確認した。
- `RTCSessionProcess.py:178-319,321-356` と `models/RTCVoiceChatSession.py:35-45` で、track 生成、failed 時 close、
  初回初期化失敗後の finalize、標準 `MediaStreamTrack.stop()` 呼び出しを確認した。
- `VoiceTransformTrack.py:62-89,161-205` で AudioBroker 障害時の縮退経路、stereo / 48 kHz 固定の無音化、
  `close()` から broker close と `stop()` を別々に呼ぶ現状を確認した。所有者を track に固定した idempotent `stop()`
  と入力 frame 属性を保つ再構築方針は現行の問題に直接対応する。
- `documents/rules/coding-py.md` の例外 chaining、ログ、型、resource ownership、コメント言語・品質規則、および
  `documents/design/backend/services/sincro-rtc.md` の Observability / Failure Modes と Change Checklist を確認した。
  backend 運用挙動の同期先が task.md に具体化され、frontend RTC 契約を更新不要とする理由も明示されている。

## 実装者への申し送り

- timeout / EOF / broken pipe の cleanup は、辞書削除だけでなく process terminate/kill、join、process close、pipe close
  の完了と、その後に manager lock を再取得できることまで観測する。
- `VoiceTransformTrack.stop()` は broker close に失敗しても `super().stop()` へ進み、二度目以降の呼び出しで broker を
  再 close しないよう、guard を資源解放開始前に確定する。
- Python production code の変更対象について、public class / method と timeout・cleanup・frame変換の lifecycle 判断を
  symbol / decision 単位で監査し、弱い既存コメントの rewrite / delete と stale comment の除去結果を `impl.md` に残す。
- `documents/design/backend/services/sincro-rtc.md` の同期は、実装・テストと同じタスクの受け入れ条件として扱う。

## Summary for Parent

- 判定: APPROVED。
- Critical / High 指摘なし。要件、設計判断、現行コード参照、境界テスト、文書同期はいずれも実装可能な粒度で確定済み。
- 更新 timeout 等で旧 session を回収する fallback と、active のまま拒否され上限判定に掛かる fallback を分けて検証する
  ことを Medium の申し送りとした。
