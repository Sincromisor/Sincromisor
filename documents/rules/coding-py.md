# コーディング規約(Python)

> **Scope**: Pythonコードベース横断のコーディング規約(型運用 / エラー / ログ / テスト / import / None / 日付 / TODO / env / 言語)
> **AGENTS.md との関係**: [AGENTS.md](../../AGENTS.md) は初動ガイドと正本リンクを保持する。サイズ閾値 / 分割判断 / 主要アンチパターンは [code-structure.md](code-structure.md) を正本とし、本書は Python 固有の横断ルールを保持する。

## 0. 設計思想

PoC では下記 2 軸を最優先する。

1. **負債が残りにくい方向を選ぶ** — 後から剥がす工数が大きいもの(型を緩める / dict をサービス境界の内側へ流す / env 直参照を許す)は最初から禁止する
2. **debug と更新がしやすい状態を維持する** — 「沈黙する失敗」「観測できない状態」「変更影響が読みにくい依存」を作らない

ルールは原則 hard。**破る場合は同じ行または直前行に `# reason: <理由>` を付ける**(レビューでの差し戻し基準は理由の有無)。

## 1. Python 型運用

| ルール                                                   | 強制度 | 補足                                                           |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| 公開関数 / メソッドの引数・戻り値型を明示                | hard   | `__init__` は `-> None` を明示                                 |
| `Any` 禁止。外部 I/O は `object` で受けて Pydantic parse | hard   | ライブラリ都合で必要な場合は `# reason:` 必須                  |
| `cast()` 禁止                                            | hard   | ガード節 / `isinstance` / Pydantic model で潰す                |
| `# type: ignore` / `# ty: ignore` 禁止                   | hard   | 使う場合は rule 指定 + `# reason: ... / 解消条件: ...` 必須    |
| `Optional[T]` ではなく `T \| None` を使う                | hard   | Python 3.12 前提                                               |
| `list` / `dict` / `tuple` は要素型まで書く               | soft   | 例: `list[ChatMessage]` / `dict[str, object]`                  |
| `Callable` / `Protocol` は境界が読みにくい場合だけ使う   | soft   | 抽象化のための抽象化を避ける                                   |
| `assert` を外部 I/O validation に使わない                | hard   | `if not ...: raise ValueError(...)` または Pydantic validation |

**Why**: `Any` / `cast()` / 雑な `dict` は「型は通っているが実体が違う」状態を作り、debug を最も困難にする。Python は実行時に壊れるまで検出できないため、境界で Pydantic による検証を行い、内側は型が読める状態を維持する。

**How to apply**: 既存コードに残っていたら、触った箇所から順に潰す。WebSocket / msgpack / JSON / env / 外部 API のレスポンスは、境界専用の Pydantic model や変換関数を一枚挟み、生の `dict` / `object` をそこで吸収する。

## 2. Lint / フォーマッタ / コミット前チェック

| 項目                         | ツール                            |
| ---------------------------- | --------------------------------- |
| Lint                         | **Ruff**                          |
| フォーマッタ (Python)        | **Ruff format**                   |
| フォーマッタ (Markdown)      | **Prettier**(`*.md` のみスコープ) |
| 型チェック                   | **ty**                            |
| テスト                       | **pytest**                        |
| パッケージ / 仮想環境 / 実行 | **uv**                            |

- Ruff の設定は [pyproject.toml](../../pyproject.toml) の `[tool.ruff.*]` を正本とする。PoC で支障が出る項目のみ明示オプトアウト
- コミット前の確認項目:
    1. `uv run ruff check .`
    2. `uv run ruff format --check .`
    3. `uv run --group dev --group full ty check .`
    4. `uv run pytest`(変更レイヤ。重い統合テストは対象を絞る)
- lint 警告を局所的に抑制する場合は `# noqa: <rule>  # reason: <理由>` を付ける(本書 §0 の `# reason:` ルールに準ずる)
- ty の警告を局所的に抑制する場合は `# ty: ignore[rule]  # reason: <理由> / 解消条件: <条件>` を付ける
- formatter の出力と衝突する手整形をしない。import の並び順も Ruff/isort に任せる
- pre-commit hook は現時点で未導入。コミット漏れによる手戻りが見えた時点で導入を検討する

**Why**: lint と format の取りこぼしは手動チェックでは必ず発生し、後で大量修正の負債になる。Ruff は Python の lint + format + import 整列を単一ツールで扱えるため、設定の分散を避けられる。

**How to apply**: 既存コードに警告が残る場合は、変更した package から警告ゼロに寄せる。CI 整備フェーズで `uv run ruff check .` / `uv run ruff format --check .` / `uv run --group dev --group full ty check .` / `uv run pytest` を自動化する。

## 3. エラーハンドリング

- 例外は **raise 基本**。`Result` 風の戻り値は使わない(言語標準の流儀に揃える)
- bare `except:` / `except Exception: pass` 禁止。最低でも `logger.exception` してから再 raise、または明示的にハンドリング理由をコメント
- 再 raise は必ず原因チェーンを残す: `raise MyError("message") from e`
- ライブラリ境界では例外型を包み直して、呼び出し元が扱うべき失敗を明示する
- `finally` で例外を握り潰さない。close / cleanup の失敗も `warning` 以上で観測可能にする
- 例外 message は英語、secret / PII / ユーザーの音声認識結果全文を不用意に含めない

**Why**: `try: ... except: pass` が一箇所でもあると debug の時間が指数的に増える。原因チェーン欠落も同様。マイクロサービス間通信は失敗点が多いため、失敗の種類と発生場所をログと例外型で追える状態にする。

**How to apply**: `except` 節を書いたら必ずログ + 再 raise か、ハンドル理由のコメントを残す。接続断・タイムアウト・validation error は、上位層で retry / fallback / user-visible error のどれにするかを明示する。

## 4. ログ / `print`

- `print()` 直書き禁止。`logging.getLogger(...)` で取得した logger を経由する
- 例外ログは `logger.exception("message")` を基本とし、traceback を文字列化して手で詰め込まない
- ログ文字列は英語。検索しやすい固定メッセージにし、可変値は logging の遅延補間か `extra` で渡す
- f-string で大量の状態を詰め込まない。必要な診断値だけを選ぶ

ログレベル指針:

| level     | 用途                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| `error`   | 復旧不能 / セッション継続に影響するもの                                              |
| `warning` | 自動復旧した異常、fallback、retry 後 success、外部サービス差分による機能縮退         |
| `info`    | service 起動 / WebSocket 接続 / WebRTC セッション / worker 初期化開始・終了          |
| `debug`   | msgpack payload の schema 検証結果、VAD / ASR / TTS / service discovery の中間データ |

### 4.1 debug ダンプ方針

音声処理 / WebRTC / service discovery は、環境依存の失敗が多い。開発時は再現に必要な診断情報を `debug` で出してよいが、常時出すとログがノイズ化し、実ユーザー環境では privacy risk も上がる。

- `debug` レベルでは、接続先 service 名、retry 回数、queue 長、payload validation の成否、音声フレーム数などを出してよい
- 音声認識結果、チャット本文、Dify token、TURN credential、S3 path など、個人情報や secret になり得る値は必要最小限にする
- ログファイル / trace 出力(`*.log` 等)は `.gitignore` で除外。リポジトリに raw diagnostic data を commit しない

### 4.2 PoC でも常時禁止

- **secret(API key / Dify token / TURN credential / S3 credential など)は生のままログに出さない**

### 4.3 ログ形式

- 固定メッセージ + 最小限の可変値を既定にする
- 例: `logger.info("worker connection established: service=%s session=%s", service_name, short_session_id)`
- 同じイベントは同じメッセージに揃える。検索語が揺れるログを増やさない

**Why**: サーバー側の debug は、非同期処理・スレッド・外部 service の状態を後から追えることが生命線。一方、secret と PII は開発中でも解禁し得ないため、診断ログとは別軸の絶対禁止として分離する。

## 5. テスト

- ランナーは `uv run pytest` から呼び出す
- 配置は package 直下の `tests/` を基本とする(例: `sincromisor-server/speech-recognizer-nemo/tests/`)
- ファイル名: `test_<対象>.py`
- フィクスチャは `tests/fixtures/` に置く。プロダクションコードから import しない
- テストのためだけに internal を公開しない — 必要な時点で純粋関数や境界処理を別ファイル化する
- 外部 service / GPU / 音声デバイス / ネットワークに依存するテストは marker を付け、通常の単体テストから分離する
- msgpack / JSON / Pydantic model の契約を変えた場合は、round-trip test を追加または更新する

**Why**: PoC ではテスト網羅率より、「壊れたら気付ける場所」を堅く守るほうが debug コストを下げる。特にサービス間 payload と音声処理の境界は、失敗時の原因切り分けが難しいため、薄くても契約テストを置く価値が高い。

## 6. import パス

- package 内 import は絶対 import を基本とする(例: `from sincro_models import ChatMessage`)
- 同一 package 内の近接モジュールでは相対 import を許可する(例: `from .Exceptions import AudioBrokerError`)
- `sys.path` の実行時変更は禁止。必要なら package 構造や `pyproject.toml` の package 設定を直す
- wildcard import 禁止。`from module import *` は使わない
- import の並び順は Ruff/isort に従う。手で並び替える必要はない
- 循環 import が起きたら、遅延 import で逃げる前に責務分割を見直す

**Why**: import が実行時状態に依存すると、開発環境では動くが compose / CI / container では壊れる状態を作りやすい。package 構造を正しく保つほうが長期的に debug しやすい。

## 7. `None` / Pydantic / serialization

- 欠損は `None` で統一する。空文字 `""` / `0` / `False` を欠損扱いしない
- 外部 I/O から来た `null` は Pydantic model の境界で `None` として受ける
- Pydantic model はサービス間 payload / env / config / 外部 API response の境界正本として使う
- 生の `dict` を service 内部へ流さない。parse 後は Pydantic model または明示型の dataclass / class に変換する
- `model_dump()` / `model_validate()` を使い、Pydantic v1 系 API (`dict()` / `parse_obj()` 等)を新規コードに増やさない
- msgpack / JSON の pack/unpack は model ごとに round-trip 可能な関数へ閉じ込める
- field 名は Python 内部では snake_case を基本とする。既存契約が PascalCase / camelCase の場合は Pydantic alias で吸収し、契約変更が必要なら明示して相談する

**Why**: `dict` と model が混在すると「どのキーが存在するか」「欠損が何で表されるか」を毎回局所判断することになり、debug 時に分岐網羅が困難になる。境界で model に固定するのが最も負債を作らない。

## 8. 日付 / タイムゾーン

- **保存・契約 (Pydantic / DB / ログ) は UTC ISO8601 文字列** で扱う
- Python の内部計算で `datetime` を使う場合は timezone-aware にする
- `datetime.now()` / `datetime.utcnow()` の新規利用禁止。`datetime.now(UTC)` を使う
- **表示用(画面 / レポート / CLI 出力)のみ JST に変換**
- naive datetime を service 間 payload に入れない
- 日付ライブラリは当面追加しない(`datetime` + ISO 文字列で十分)。差分計算等が増えたら標準ライブラリで足りるか先に確認する

**Why**: 「TZ 違いで再現しない bug」は debug が最も困難な種類のひとつ。境界で UTC ISO8601 文字列に固定するのが最も負債を作らない。

## 9. TODO / FIXME / `@deprecated`

- 形式: `# TODO(task-<id>-<slug>): <内容>` — canonical task ID 紐付け必須。旧 `TODO(TASK-yymmddhhmmss): ...` は移行互換として許容する。ID 無しの TODO はレビューで差し戻し
- `FIXME` は使わない(`TODO` に統一)
- deprecation コメントを付けたら **同タスク or 次タスクで削除**。残置禁止
- コメントに「あとで」「いずれ」だけ書くのは禁止 — 必ずタスク化する

**Why**: 紐付かない TODO は数ヶ月で誰も追えなくなる。deprecated の残置は「使われていない死んだコード」を増殖させる。

## 10. 環境変数 / 設定

- env var は設定専用 module / Pydantic model / process argument model に集約する
- service 本体で `os.environ["X"]` / `os.getenv("X")` を直参照することは**禁止**
- `.env` の読み込みは entrypoint 近傍に限定し、読み込んだ値は型付き設定として下流へ渡す
- 新規 env var を追加したら同コミットで [examples/compose.env](../../examples/compose.env) と compose の environment を同期(値はダミー or プレースホルダ)
- 設定追加時は Python 側の引数・設定クラス、compose、設計文書の 3 点が整合しているか確認する
- secret 系(API key 等)はログに出さない。`.env` 本体は絶対に commit しない(AGENTS.md と整合)

**Why**: env 直書きは「どこで何を読んでいるか」が grep でしか分からず、deploy 時の差し替え漏れ温床になる。Sincromisor は compose + service discovery 前提のため、設定の正本が散ると起動時の失敗が読みにくくなる。

## 11. 言語ポリシー

| 対象                          | 言語                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| identifier(変数 / 関数 / 型)  | 英語                                                                                                     |
| ログ / Error message          | 英語(運用 / 検索しやすさ)                                                                                |
| ソースコード内コメント        | 日本語(AGENTS.md と整合)                                                                                 |
| docstring                     | 日本語。公開 API / 外部利用を想定する package は英語も可                                                 |
| ドキュメント (`documents/**`) | 日本語                                                                                                   |
| ユーザー向け文言              | 日本語                                                                                                   |
| Pydantic field description    | 日本語または英語。ユーザー表示用は日本語、開発者向け診断は英語でも可                                     |
| コミットメッセージ            | 日本語。形式は [tasks/README.md](../../tasks/README.md) の Conventional Commits ベース規約を正本とする   |

## 12. その他の負債抑制ルール

- **マジックリテラルの定数化** — モデル名 / タイムアウト / queue サイズ / retry 間隔 / しきい値は `UPPER_SNAKE` 定数に集約
- **一時的なフラグを controller / service / worker の引数に増やさない** — 設定 model / request model / 明示的な state object 経由で渡す(引数増殖は責務境界の崩れの起点)
- **コメントアウトでの「とりあえず無効化」禁止** — 不要コードは削除する(git history が正本)
- **型 / Pydantic model は境界ごとに正本を 1 箇所**。同型を別ファイルで再定義しない
- **スレッド / WebSocket / file handle は所有者を明確にする**。生成した層が close / join / cleanup の責務を持つ
- **共有 mutable state は lock / queue / Event など同期原語を明示する**。複数 thread から直接 list / dict を触らない
- **「将来の差し替えのため」の抽象を作らない** — 必要になった時点で抽出する(Rule of Three 手前で動く / AGENTS.md と整合)
