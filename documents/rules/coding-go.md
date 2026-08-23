# コーディング規約(Go)

> **Scope**: Go コードベース横断のコーディング規約(module / package / 型 / error / context / 並行処理 / ログ / テスト / 設定 / コメント)
> **AGENTS.md との関係**: [AGENTS.md](../../AGENTS.md) は初動ガイドと正本リンクを保持する。サイズ閾値 / 分割判断 / 主要アンチパターンは [code-structure.md](code-structure.md)、コメント品質の横断基準は [source-comments.md](source-comments.md) を正本とし、本書は Go 固有の横断ルールを保持する。

## 0. 設計思想

Go では、言語と標準ツールが用意する単純な流儀を優先する。

1. **負債が残りにくい方向を選ぶ** — 過剰な抽象、暗黙の goroutine、未検査の外部入力、場当たり的な env 参照を増やさない
2. **失敗と lifecycle を追跡可能にする** — error chain、context、resource owner、goroutine の終了条件を呼び出し側から読める状態にする
3. **機械的な判断をツールへ任せる** — format と import 整列を手作業で調整せず、標準 tool の出力を受け入れる

ルールは原則 hard。破る場合は同じ行または直前行に `// reason: <理由> / 解消条件: <条件>` を付ける。
公開 API の doc comment と競合する場合は、doc comment の後、対象行の直前に置く。

## 1. Go version / module / dependency

- Go version と toolchain version は `go.mod` の `go` / `toolchain` directive を正本とする。文書や CI に別の version を重複定義しない
- module は deploy / release の単位ごとに 1 つを基本とする。明確な独立 release 理由なしに `go.mod` を増やさない
- application code は原則 `internal/`、実行 entrypoint は `cmd/<command>/` に置く。外部 module から import させる契約がある package だけを `internal/` の外へ置く
- `go get` による dependency 追加は、標準 library で足りない理由と保守状態を確認してから行う
- dependency を追加・削除した変更では `go mod tidy` 後の `go.mod` / `go.sum` を同じ commit に含める
- `replace` / `exclude` directive は一時回避に限定し、`// TODO(task-<id>-<slug>):` で削除条件を追跡する

## 2. Format / lint / コミット前チェック

| 項目            | tool                   |
| --------------- | ---------------------- |
| format          | `gofmt`                |
| import 整列     | `goimports`            |
| 静的検査        | `go vet`               |
| test            | `go test`              |
| data race 検出  | `go test -race`        |
| module 整合     | `go mod tidy -diff`    |
| Markdown format | Prettier (`*.md` のみ) |

- すべての `.go` file は `gofmt` 済みにする。format と import 順序の手整形を review 論点にしない
- `goimports` を導入した module では、その出力を import の正本とする。未導入時も stdlib / third-party / local の group を分ける
- commit 前の確認項目:
    1. `gofmt -l .` の出力が空
    2. `go vet ./...`
    3. `go test ./...`
    4. 並行処理を変更した場合は `go test -race ./...`
    5. dependency を変更した場合は `go mod tidy -diff`
- lint suppression は rule 名、必要な理由、解消条件を同じ箇所に残す。file / package 全体の suppression は禁止する
- module 固有の lint tool を追加する場合は、version と設定 file を module 内で固定し、本節と実行 script を同じ変更で更新する

## 3. Package / 命名 / API

- package 名は短い小文字の単数形を基本とし、underscore や `util` / `common` / `misc` / `types` のような責務不明の名前を使わない
- file 名は小文字の snake_case を基本とし、platform / architecture / test suffix は Go toolchain の規約に従う
- identifier は `MixedCaps` / `mixedCaps` を使う。initialism は `ID` / `URL` / `HTTP` / `JSON` のように一貫させる
- package 名を export 名に重複させない。`signaling.SignalingClient` ではなく `signaling.Client` のように、import 後の読み方で命名する
- getter に `Get` を付けない。field が `owner` なら `Owner()` とし、setter が必要な場合だけ `SetOwner(...)` とする
- receiver 名は短く、型内で統一する。`this` / `self` / 型名の省略形が file ごとに揺れる命名を避ける
- exported symbol は互換性 contract である。必要になるまで export せず、application 内部の package は `internal/` に閉じる
- named result parameter は、defer で結果を書き換えるなど意味が明確な場合だけ使う。長い関数での naked return は禁止する

## 4. 型 / interface / generics

- struct は有効な zero value を持たせることを優先する。zero value で使用不能な型は constructor と不変条件を doc comment に書く
- constructor は validation、dependency 注入、resource 確保が必要な場合に置く。field 代入だけの `NewX` を機械的に作らない
- interface は原則 consumer 側で、必要な method だけを定義する。実装 package が「将来の差し替え」のために大きな interface を先回りして置かない
- function は具体型を返すことを基本とし、caller が必要とする最小 interface を引数で受ける
- `interface{}` ではなく `any` を使う。ただし外部 I/O の一時受け口に限定し、validation 後に domain type へ変換する
- pointer to interface は使わない。pointer receiver と value receiver は型内で混在させず、mutation、copy cost、`sync.Mutex` 所有の有無で選ぶ
- generics は複数の具体型で同じ algorithm / container の重複を除ける場合に使う。domain contract や dependency 注入を曖昧にする目的では使わない
- copy 禁止の値 (`sync.Mutex`、`sync.Once` など)を含む struct を値渡ししない

## 5. Error handling / panic

- 失敗し得る処理は `error` を返す。error を `_` へ捨てず、その場で処理するか caller へ返す
- error に operation と最小限の診断文脈を加える: `fmt.Errorf("decode offer: %w", err)`
- caller が原因を判定する必要がある error だけ `%w` で wrap する。wrap した error は API の一部になるため、abstraction boundary を越えて漏らすかを意図的に決める
- error 判定は文字列比較や直接 `==` ではなく `errors.Is` / `errors.As` を使う。`io.EOF` など標準契約が明示する例外はその契約に従う
- sentinel error / custom error type は caller が分岐する必要がある場合だけ export する
- error string は英語の小文字で始め、末尾に句点を付けない。secret / PII / payload 全文を含めない
- 同じ error を複数 layer で log しない。回復・破棄・process boundary のいずれか、運用判断を行う layer で一度だけ log する
- `panic` は programmer error、起動時の回復不能な invariant 違反に限定する。通常の I/O、validation、設定不備を panic で処理しない
- `recover` は server / worker の process boundary で可用性を守る場合に限定し、未知の panic は stack を記録して再 panic または安全に process を終了する
- `os.Exit` / `log.Fatal` は `main` の最終的な終了判断に限定する。下位 package で呼ばず、`defer` による cleanup を飛ばさない

## 6. `context.Context` / timeout

- request、session、外部 I/O に紐づく処理は `context.Context` を第一引数 `ctx` で受け、call chain 全体へ伝播する
- `Context` を struct field に保存しない。標準 / third-party interface との適合で避けられない場合は `// reason:` を残す
- `nil` context や custom context type を使わない。request scope の値を独自 parameter container として context に詰め込まない
- library / domain layer で `context.Background()` に置き換えて cancellation を切らない。root context は `main`、test、明示的な detached task の境界だけで生成する
- `context.WithCancel` / `WithTimeout` / `WithDeadline` の cancel function は生成直後に `defer cancel()` するか、所有者へ明示的に渡す
- network / process / blocking I/O には deadline を設ける。timeout 値は typed config に集約し、処理途中へ magic number を置かない
- retry / queue wait / channel send は `ctx.Done()` で中断可能にし、cancellation error を別の一般 error に潰さない

## 7. 並行処理 / resource lifecycle

- goroutine を開始する関数は、終了条件、cancel 方法、error の観測先、join 責務を doc comment または近接する lifecycle comment に書く
- fire-and-forget goroutine は禁止する。process lifetime と一致する background task も root context と shutdown 待機を持たせる
- channel は通信と ownership transfer に使い、単純な相互排他を channel で再実装しない
- channel を close するのは送信側の owner とする。受信側や複数 producer が無秩序に close しない
- channel の buffer size は backpressure contract である。値の根拠、満杯時の挙動、drop / block 方針をコメントまたは設計文書に残す
- 共有 mutable state は `sync.Mutex` / `RWMutex` / atomic などで保護し、どの field 群を守る lock かを明確にする
- lock 保持中に network I/O、callback、長時間処理を行わない。lock の取得順序が複数ある場合は invariant をコメントする
- timer / ticker / response body / file / connection は生成した layer が停止・close の責務を持つ。`defer` だけでは遅すぎる loop 内 resource は iteration ごとに明示解放する

## 8. Logging

- structured logging は標準 library の `log/slog` を基本とし、package 内で global logger を増やさず dependency として渡す
- `fmt.Print*` / `log.Print*` の直書きは、CLI の user-facing output と bootstrap 中の最終 error 表示を除いて使わない
- message は英語の固定文字列、可変値は typed attribute で渡す。検索語が変わる文字列補間を避ける
- request / session を追跡する ID は短縮または pseudonymized value を使い、音声認識結果やチャット本文を既定で記録しない
- secret、credential、token、署名前 URL、個人情報は log に出さない

| level   | 用途                                                                    |
| ------- | ----------------------------------------------------------------------- |
| `Error` | request / session 継続不能、手動対応が必要な失敗                        |
| `Warn`  | fallback、retry、機能縮退、回復済みだが観測すべき異常                   |
| `Info`  | service lifecycle、接続、session、worker の開始・終了                   |
| `Debug` | schema 検証、queue 長、retry 回数など、原因調査に必要な非機密の中間状態 |

## 9. 外部 I/O / serialization / 時刻

- JSON / msgpack / DB / service 間 payload は境界専用 struct で受け、validation 後に domain type へ変換する。`map[string]any` を内部へ流さない
- struct tag は外部 contract である。field rename、`omitempty`、nil と empty slice / map の差を破壊的変更として確認する
- 新しい内部管理 API は未知 field を reject する strict decode を基本とする。公開済み契約では forward compatibility を確認して選ぶ
- `time.Time` は内部計算に使い、location を明示する。保存・通信は UTC の RFC 3339 文字列を基本とし、表示時だけ JST へ変換する
- `time.Now()` を純粋な domain logic に埋め込まない。時刻依存の判断は clock function / interface を注入して test 可能にする
- byte 数、sample 数、frame 数、duration の単位を型名・field 名・コメントのいずれかで明示する

## 10. Test

- test runner は `go test` を使い、file 名は `*_test.go`、test function は `TestXxx` とする
- 入出力の組み合わせを検証する場合は table-driven test と `t.Run` を基本とし、case 名に失敗条件が分かる説明を付ける
- assertion library を前提にせず、失敗 message に `got` / `want` と判断に必要な入力を含める。secret / PII は含めない
- `t.Parallel()` は global state、port、filesystem、clock を共有しない test にだけ付ける
- `time.Sleep` で非同期処理の完了を待たない。channel、hook、fake clock、eventual condition with deadline で同期する
- fixture / golden file は `testdata/` に置き、生成・更新条件を test または task artifact に残す
- parser、serialization、外部入力境界には round-trip test、malformed input test、必要に応じて fuzz test を置く
- network、GPU、実 device、外部 service に依存する integration test は通常の unit test と明示的に分離する
- goroutine、channel、lock を変更した場合は、正常終了だけでなく cancellation、timeout、error、early return の leak を検証する

## 11. 環境変数 / 設定

- env var / flag は `main` 近傍の設定 loader に集約し、validation 済みの typed config を下流へ渡す
- domain / service 本体で `os.Getenv` / `os.LookupEnv` を直参照しない
- 必須値の欠損、不正な duration / URL / enum は起動時に field 名を含む error として返す。secret の値自体は含めない
- 新規 env var は同じ変更で [examples/compose.env](../../examples/compose.env)、compose environment、設定 loader、関連設計文書を同期する
- default 値は一箇所に置き、sample env、flag、実装で重複定義しない

## 12. 言語ポリシー

| 対象                     | 言語                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| identifier               | 英語                                                                                            |
| log / error message      | 英語（運用時に検索しやすくするため）                                                            |
| source code 内の comment | 日本語。外部利用を前提とする public module は英語も可                                           |
| Markdown 文書            | 日本語。[coding-md.md](coding-md.md) を正本とする                                               |
| user-facing message      | 日本語                                                                                          |
| commit message           | 日本語。[tasks/README.md](../../tasks/README.md) の Conventional Commits ベース規約を正本とする |

Go の doc comment は日本語で書く場合も、exported symbol 名または `Package <name>` から始め、
`go doc` で単独表示されても contract が分かる完全な文にする。

## 13. TODO / deprecation

- 形式: `// TODO(task-<id>-<slug>): <内容> / 削除条件: <条件>`。canonical task ID と削除条件のない TODO は禁止する
- 旧 `TODO(TASK-yymmddhhmmss): ...` は移行互換として許容する。新規 TODO には使わない
- `FIXME` / `HACK` は使わず TODO に統一する
- deprecated な exported symbol は `// Deprecated: <代替と削除条件>` 形式にし、同 task または後続 task で削除を追跡する
- コメントアウトした code を残さない。不要 code は削除し、判断履歴は task / ADR に残す

## 14. ソースコードコメント品質

コメント品質の目的、既存コードへの適用、省略条件、audit schema は [source-comments.md](source-comments.md) を
正本とする。Go でも exported API、境界、非自明な判断、resource lifecycle は必須の下限であり、
それだけで十分とは判断しない。package 内の orchestration、goroutine 間の接続、state transition、
data transformation を一般的な開発者が短時間で調査できる状態にする。

### 14.1 必須対象

- package comment とすべての exported type / function / method / const / var
- 単位、zero value、nil、ownership、validation 条件が名前と型だけでは分からない exported field
- protocol / serialization / filesystem / network / process など外部境界
- goroutine、channel、lock、cleanup owner、shutdown 順序
- timeout、buffer size、retry、backoff、drop、fallback などの運用判断
- 単位、時刻基準、version、互換性、nil / zero value の意味
- 複数の function / goroutine / channel を接続する orchestration と終了までの flow
- state transition、event source、raw payload から domain struct への変換
- 名前と型だけでは package 内での役割が分からない private function / block

exported symbol の doc comment は symbol 名から始め、完全な文にする。日本語の場合も `ParseOffer は...。` の形式を使う。

```go
// ParseOffer は外部から受信した SDP offer を内部表現へ変換する。
//
// 未知の type と空の SDP は、下流の PeerConnection を生成する前に拒否する。
// JSON の field 追加は受理するが、既存 field の意味変更は契約変更として扱う。
func ParseOffer(raw []byte) (Offer, error) {
	// ...
}
```

### 14.2 最低限含める内容

| 対象                    | 書く内容                                                                |
| ----------------------- | ----------------------------------------------------------------------- |
| exported API            | 責務、入力境界、戻り値、error 条件、副作用、非対象                      |
| boundary / parser       | raw 値、validation、互換性、reject 条件、caller に返す error            |
| concurrency / lifecycle | owner、開始・終了条件、cancel / join、close 順序、leak を防ぐ invariant |
| threshold / fallback    | 値の意味と根拠、発動条件、誤調整時の失敗 mode、変更時の確認先           |
| unit / time / version   | 単位、基準時刻、version の意味、変換・丸め・互換性条件                  |

private helper は、名前、型、周辺 API から責務が明らかで、境界 / heuristic / lifecycle を持たない場合に限り
コメントを省略できる。ただし private、短い、型がある、既存コードにコメントがないことは単独の省略理由に
ならない。上位 flow での位置、state change、前後関係まで局所的に読めるかを確認する。

### 14.3 Audit と禁止事項

comment audit は file 単位ではなく symbol / block / decision / flow 単位で
`keep` / `rewrite` / `delete` / `add` を判断する。変更した API、boundary、goroutine、heuristic と
change comprehension surface を確認し、reader question と required reader knowledge を記録する。
関連する stale comment は同じ変更で更新または削除する。

禁止するコメント:

- `// error を返す`、`// goroutine を開始する` のような処理説明だけのコメント
- exported API と lifecycle だけを機械的に埋め、内部 flow の理解困難を放置すること
- 名前や型から分かる責務要約だけで、失敗条件、副作用、ownership を説明しない doc comment
- threshold / buffer size の存在だけを書き、根拠や満杯時の挙動を説明しないコメント
- 「設計文書や test を参照」とだけ書き、実コード上の contract を示さないコメント
- 理由や削除条件のない `temporary` / `workaround` / TODO
- `private`、`短い`、`型がある`、`既存コードにもない` だけを省略理由にすること
- 実装と同期しない履歴メモ、stale comment、コメントアウトした code

## 15. その他の負債抑制ルール

- magic number / string は domain 上の意味を持つ名前へ集約する。ただし一度しか使わず意味が自明な値まで定数化しない
- package-level mutable state を避ける。必要な state と dependency は owner struct に集約する
- `init()` は registration など避けられない package 初期化に限定し、I/O、goroutine 起動、設定 load を行わない
- `defer` の error を無視しない。flush / close の失敗が結果へ影響する場合は named helper などで caller に返す
- `reflect` / `unsafe` / `//go:linkname` は標準的な型表現で実現できない場合に限定し、理由、invariant、test、削除条件を残す
- build tag と platform-specific file は対象環境と fallback を明示し、通常 build で実装欠落を起こさない
- 「将来の差し替え」のための package、interface、factory を作らない。具体的な複数実装または test seam が必要になった時点で抽出する

## 16. 参照した外部規約

2026-07-26 に Go 公式文書を確認し、次の範囲を採用した。本プロジェクトで判断が異なる場合は本書を正本とする。

- [Effective Go](https://go.dev/doc/effective_go): `gofmt`、命名、comment、error、panic の基本慣習
- [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments): context、interface、goroutine lifetime、error string、receiver、test failure の review 観点
- [Go Doc Comments](https://go.dev/doc/comment): package / exported symbol の doc comment 形式
- [Organizing a Go module](https://go.dev/doc/modules/layout): `cmd/` / `internal/` と module layout
- [Error Values FAQ](https://go.dev/wiki/ErrorValueFAQ): wrapped error と `errors.Is` / `errors.As` の扱い
- [Data Race Detector](https://go.dev/doc/articles/race_detector): `go test -race` の適用範囲と制約
- [`log/slog` package](https://pkg.go.dev/log/slog): structured logging と level / attribute の標準 API
