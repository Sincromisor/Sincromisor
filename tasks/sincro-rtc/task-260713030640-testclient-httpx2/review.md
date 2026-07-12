# Review: task-260713030640-testclient-httpx2

## 判定

APPROVED

Critical / High の blocking 指摘はない。警告の発生原因、依存の配置先、採用しない案、変更対象、非対象、検証方法、ドキュメント同期不要の理由が一意かつ検証可能に定義されている。現行コードおよび lockfile との整合も確認できた。

## 評価結果

- 要件の明確さ: `httpx2` を root dev dependency として直接追加し、production dependency には入れないことが明確である。警告抑制を禁止し、対象 warning category の error 化によって非発生を検証するため、完了条件は機械的に判定できる。
- 設計判断: Starlette が `httpx2` を優先し、欠落時だけ従来 `httpx` へ fallback する現行挙動に対して、依存追加で解消する方針が確定している。従来 `httpx` の削除、private transport の直接利用、warning suppression を採用しない理由も記載されている。
- 現行コード整合: `pyproject.toml:16-23` は dev tooling の dependency group、`test_rtc_signaling_server.py:5-22` は FastAPI `TestClient` の import と client helper、`uv.lock:849-861` は従来 `httpx` の解決箇所であり、task.md の参照と一致する。現環境で warning-as-error コマンドを実行すると、記載どおり `httpx2` import failure 後の `StarletteDeprecationWarning` により collection error となることも確認した。
- スコープ: dev dependency と lockfile、既存 endpoint テストによる回帰確認に閉じており、production runtime、HTTP / WebRTC 契約、他 service の警告整理を明示的に除外している。
- テスト可能性: 警告そのものの検出、既存4テストの 429 / 503 / 成功 schema / 障害後継続処理、依存解決、Ruff / format / ty / repository gate が対応付けられている。
- ドキュメント同期: 公開 API、通信契約、利用者向け設定、production code を変更しないため不要という判断は妥当である。Python production code のコメント監査が対象外である理由も明記されている。

## 指摘事項

なし

## 実装者への申し送り

- `httpx2` は root `dependency-groups.dev` に直接追加し、`uv.lock` は正規コマンドで再生成して手編集しないこと。
- warning-as-error の対象 category を緩めず、警告抑制設定やテスト assertion の変更によって通さないこと。
- lockfile 更新時は `httpx2` の解決だけでなく、従来 `httpx` を必要とする package が引き続き解決されていることを確認すること。
- 実装中に FastAPI / Starlette の version pin、production dependency、endpoint 契約へ変更が及ぶ場合は本レビューのスコープを超えるため、タスク記述の改訂と再レビューへ戻すこと。
