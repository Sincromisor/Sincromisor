# TestClientをhttpx2へ移行して非推奨警告を解消する

<!--
  起票の入口は /new-task（起票 + 独立レビューを一括）。既存 task.md を後から再レビューする
  場合は /review-task <task-dir> を使う。いずれも APPROVED を得てから /run-task に渡す。
  各節は tasks/AUTHORING-CHECKLIST.md（task-reviewer 評価観点の正本）に対応する。
  初回 NEEDS_REVISION の最頻出根拠は「設計判断の未確定」と「ドキュメント同期要否の未記載」。
-->

## 背景 / 目的

`sincro-rtc` の endpoint テストは FastAPI の `TestClient` を使っている。現在解決される Starlette 1.3.1 は
`httpx2` を優先して test client backend として読み込み、未導入時だけ従来の `httpx` へ fallback する。この
fallback により、次の警告がテスト collection 時に1件発生する。

`StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.`

この警告を無視・抑制せず、Starlette が指定する `httpx2` backend を開発・テスト環境へ明示導入して解消する。
endpoint の挙動や production runtime の依存面は変更しない。

## 完了条件（受け入れ条件）

- [ ] root `pyproject.toml` の `dependency-groups.dev` に `httpx2` を直接依存として追加し、`uv.lock` を同期する。
      `sincro-rtc` の production dependencies には追加しない。
- [ ] `uv run --group dev --group full pytest sincromisor-server/sincro-rtc/tests/test_rtc_signaling_server.py
  -W error::starlette.exceptions.StarletteDeprecationWarning` が成功し、FastAPI `TestClient` の import・生成・HTTP
      request 実行時に `StarletteDeprecationWarning` が発生しない。
- [ ] warning filter、`pytest.ini`、`filterwarnings`、`warnings.catch_warnings()` などで警告を抑制しない。既存の
      `from fastapi.testclient import TestClient` と endpoint テストの assertion は維持し、`httpx2` backend 上でも
      429、503、成功 schema、障害後の endpoint 継続処理が従来どおり通る。
- [ ] `uv run ruff check .`、`uv run ruff format --check .`、
      `uv run --group dev --group full ty check .`、対象 pytest、`npm run gate` が成功する。

## 設計判断（着手前に確定済み）

- `httpx2` は test tooling であるため、root `pyproject.toml` の `dependency-groups.dev` に直接追加する。
  `sincromisor-server/sincro-rtc/pyproject.toml` の runtime dependencies に入れる案は production image の依存面を
  不要に増やすため採らない。
- `httpx` は `datasets` 等が独自に利用する transitive dependency であり、本タスクでは削除・置換・constraint 追加を
  行わない。Starlette は `httpx2` が存在すれば先に選択するため、両 package の共存を許容する。
- FastAPI が公開する `fastapi.testclient.TestClient` import を維持する。Starlette の private transport や
  `httpx2` client を直接組み立てる案は framework の test client lifecycle を複製するため採らない。
- 警告の解消は dependency によって行い、warning suppression は禁止する。将来 `httpx2` が欠落または互換性を失った場合に
  warning-as-error テストが失敗し、fallback の再発を検出できる状態を維持する。
- 新しい型・module・schemaは導入しない。外部 network へ接続するテストも追加せず、既存 ASGI in-process test client
  の境界内で検証する。

## スコープ境界

本タスクは `httpx2` の dev dependency・lockfile 同期と、既存 `sincro-rtc` endpoint テストによる警告非再発の固定を
含む。依存タスクはない。

次はスコープ外とする。

- FastAPI、Starlette、httpx の version pin・downgrade・一括更新
- `datasets` 等が利用する従来 `httpx` の削除や移行
- endpoint、HTTP payload、WebRTC 契約、production code の変更
- 他 backend service の test client 整理や warning 全般の一括解消

## 実装方針（既存コード整合: file:line）

- `pyproject.toml:16-23`: root の `dependency-groups.dev` が pytest と静的検査 tooling を管理している。同じ group に
  `httpx2` を追加する。
- `uv.lock:849-861`: 現在は従来 `httpx` のみが解決されている。`uv lock` により `httpx2` とその dependency graph を
  正規生成し、手編集しない。
- `sincromisor-server/sincro-rtc/tests/test_rtc_signaling_server.py:5-22`: FastAPI `TestClient` を import し、
  `create_rtc_signaling_app()` から in-process client を作る。import と helper を維持したまま、新 backend で既存4テストを
  実行する。
- インストール済み `starlette/testclient.py:32-50` の現行挙動は `httpx2` の import を先に試し、欠落時に `httpx` へ
  fallback して `StarletteDeprecationWarning` を発生させる。dependency 追加でこの fallback を通らない状態にする。

## テスト

- 変更前の再現コマンドは
  `uv run --group dev --group full pytest sincromisor-server/sincro-rtc/tests/test_rtc_signaling_server.py -W default -q`
  とし、collection 時の `StarletteDeprecationWarning` 1件を基準にする。
- 変更後は同じ対象を
  `-W error::starlette.exceptions.StarletteDeprecationWarning` で実行し、4件の endpoint テストが PASS することを
  確認する。単に warning summary が表示されないだけでなく、対象 category を error 化して非発生を固定する。
- `uv tree` または lockfile 検査で root dev group から `httpx2` が解決され、従来 `httpx` を必要とする package の解決を
  壊していないことを確認する。
- Python の Ruff、format、ty と repository 標準の `npm run gate` を実行する。

## ドキュメント同期の要否

不要。開発・テスト専用 dependency の移行であり、production runtime、公開 API、HTTP / WebRTC 契約、利用者向けの
設定・運用挙動を変更しない。生成物・公開バレルも変更しない。Python production code を変更しないため、
`documents/rules/coding-py.md` のソースコードコメント監査対象もない。
