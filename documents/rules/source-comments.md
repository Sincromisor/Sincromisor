# ソースコードコメント品質

> **Scope**: Python / TypeScript / Go を含む production code 横断のコメント品質、必須対象、省略条件、既存コードへの適用、comment audit。
> **言語別規約との関係**: 本書はコメントの目的と品質基準の正本である。docstring、JSDoc / TSDoc、Go doc comment などの記法と言語固有の対象は [coding-py.md](coding-py.md)、[coding-ts.md](coding-ts.md)、[coding-go.md](coding-go.md) を参照する。

## 0. コメントの目的

ソースコードコメントには、次の 2 つの独立した目的がある。

1. **安全な変更を可能にする** — 契約、制約、失敗条件、副作用、判断理由、resource ownership など、誤って変えると壊れる条件を残す。
2. **調査時の理解時間を短縮する** — 処理の全体像、段階、状態遷移、データ表現、離れたコード間の関係を示し、実装を逐一逆解析しなくても目的と流れを把握できるようにする。

public API、境界、非自明な制約へのコメントは**必須の下限**であり、それだけ満たせば十分という意味ではない。
安全性を説明していても処理の位置づけが読めないコメント、処理を要約していても変更条件が読めないコメントは、
対象に必要な目的の片方しか満たしていない。

コメントで責務分割を代替しない。ただし、命名や分割を改善したことだけを理由に、複数の処理段階の関係、
domain 上の意味、非局所的な前後関係まで省略しない。構造とコメントは競合せず、異なる読解コストを下げる。

## 1. 必須対象

### 1.1 契約と変更安全性

次の対象は、言語別の標準 doc comment または近接する実装コメントを必須とする。

- exported / public な module、type、class、function、method、component、hook、domain-significant constant
- protocol、serialization、storage、filesystem、network、browser API、process などの境界
- schema / parser、version、互換性、validation、reject / fallback 条件
- resource owner、cleanup、shutdown、goroutine / thread / worker、lock、queue、channel
- threshold、retry、timeout、backoff、buffer、drop、degradation、recovery などの運用判断
- 座標系、単位、左右定義、時刻基準、frame index、confidence / reliability、nil / zero value の意味
- 外部仕様由来の制約、workaround、性能上の判断、壊してはいけない不変条件

### 1.2 調査と理解支援

public / private を問わず、次の対象はコードだけを順に追うより、要約を置いた方が調査時間を短縮できる場合に
コメントを必須とする。

- file / module がシステム内で担当する役割と、隣接 module との責務境界
- orchestration、pipeline、複数段階の変換や検証を順番に実行する処理
- state machine、mode 切り替え、event / callback の発生元と状態遷移
- raw input から domain model、座標、時刻、frame、payload などへの表現変換
- 複数の helper、service、worker、queue、callback にまたがる処理の接続関係
- 名前と型だけでは、上位処理における役割や呼び出し順序が分からない private function / block
- 意図的な no-op、早期 return、処理の延期、後段へ委ねる責務
- 一見不要に見える順序、重複、cache、copy、待機、clamp、normalization

「最終的には実装を追えば分かる」は省略理由にならない。コメントは、調査者が読むべき実装範囲を狭め、
現在位置と次に確認すべき処理を判断できるようにするために置く。

## 2. 許容する「何をしているか」のコメント

禁止するのは、コードと同じ粒度で一行ずつ読み上げる逐語説明である。次のように、複数行を一段高い抽象度で
要約し、コード単体には現れない関係を示すコメントは積極的に書く。

- この block / function が処理全体のどの段階にいるか
- 入力をどの表現からどの表現へ変換するか
- この段階で完了させる責務と、後段へ委ねる責務
- 複数の分岐や helper が共同で成立させる domain 上の処理
- event、state、resource の前後関係

例:

```ts
/*
 * MediaPipe座標をVRMのlocal座標へ正規化する。
 * smoothingとIK補正は後段で行うため、ここでは座標系の変換だけを完了させる。
 */
```

次のような逐語説明は追加しない。

```ts
// 配列をループする。
for (const sample of samples) {
    // sampleを変換する。
    convert(sample);
}
```

## 3. 既存コードへの適用

- **既存コードにコメントがないことは、新規・変更コードでコメントを省略する理由にならない。**
- 周辺コードは命名、契約、依存関係の参考にするが、コメントの量と品質は現行規約を正本とする。
- 新規 file / symbol は、最初から本書の基準を満たす。
- 既存コードを変更する場合は、変更した symbol / decision だけでなく、その変更を理解するために読む必要がある
  直接の helper、state、event、lifecycle、データ変換を **change comprehension surface** として確認する。
- change comprehension surface に説明不足があれば、今回の変更を安全かつ効率的に調査できる範囲でコメントを
  追加・更新する。無関係な file 全体の一括 remediation までは要求しない。
- 未変更範囲で見つけた広域なコメント負債は、対象 symbol、読解上の問題、推奨する remediation 単位を
  task artifact または後続タスクへ記録する。

この方針は既存 file 全体への無制限な scope 拡大を求めるものではない。一方で、変更箇所だけを機械的に見て、
理解に不可欠な近接処理の説明不足を残すことも認めない。

## 4. コメントの省略条件

コメントを省略できるのは、読者が局所的なコード、名前、型から次を誤解なく判断できる場合に限る。

- 上位処理における目的と位置づけ
- 入力と出力、主要な state change
- 前後の処理との関係と、順序に意味があるか
- 失敗、副作用、resource ownership の有無
- domain 固有の表現、単位、制約がないこと

次は単独では有効な省略理由にならない。

- private / internal である
- function や block が短い
- 型が付いている
- test や設計文書を読めば分かる
- 実装を最後まで追えば分かる
- 既存コードや同じ directory にコメントがない
- 命名や関数分割を改善した

省略判断に迷う場合は、まず命名、型、関数分割、引数 object、package / module 境界を改善する。その後も
上記の読者向け情報がコード上に現れない場合はコメントを書く。

## 5. 記法と配置

- exported / public API は言語別の標準 doc comment を使い、editor / `go doc` / IDE hover から読める形にする。
- file / module comment は責務一覧だけで終わらせず、処理全体での位置、主要な入力と出力、隣接責務を示す。
- block comment は対象処理の直前に置く。離れた設計メモとして残さない。
- comment から設計文書や test へ誘導する場合も、実コード上の役割、契約、確認観点を近接箇所に書く。
- source code 内コメントの言語は各言語規約に従う。Error message や log の言語方針とは分離する。

## 6. Comment audit

comment audit の最小単位は file ではなく、対象 symbol / block / decision / flow とする。変更した production code と
change comprehension surface について、既存コメントと不足している読者向け情報を
`keep` / `rewrite` / `delete` / `add` に分類する。

audit artifact を作る場合は、少なくとも次の列を持たせる。

| 列                          | 内容                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| `path`                      | 対象 file                                                               |
| `symbol / block / decision` | public symbol、private flow、state transition、boundary、heuristic など |
| `kind`                      | API / navigation / flow / data / lifecycle / constraint / fallback など |
| `current comment`           | 既存コメントの有無と、有る場合に説明している内容                        |
| `reader question`           | コメントがない場合に読者が逆解析しなければならない問い                  |
| `required reader knowledge` | 安全な変更または短時間の理解に必要で、局所コードだけでは読めない情報    |
| `decision`                  | `keep` / `rewrite` / `delete` / `add`                                   |
| `action / omission reason`  | 実施した編集、または §4 を満たす具体的な省略理由                        |
| `reviewer note`             | reviewer / evaluator が実コードと照合する観点                           |

`public export のため追加`、`既存コメントで十分`、`self-explanatory` のような定型理由だけでは完了扱いにしない。
何を安全に変更できるようにしたか、またはどの reader question を局所的に解決したかを対象ごとに記録する。

## 7. 禁止事項

- コードを同じ粒度で読み上げるだけのコメント
- 名前や型の言い換えだけで、役割、前後関係、契約のいずれも追加しないコメント
- public API と非自明な制約だけを機械的に埋め、内部 flow の理解困難を放置すること
- 「設計文書 / test を参照」とだけ書き、実コード上の目的や確認観点を説明しないコメント
- 古い実装経緯だけを残し、現在の判断を説明しないコメント
- 根拠や削除条件のない `temporary`、`workaround`、`magic`、TODO
- 実装と同期しない stale comment
- コメントアウトしたコードの残置

## 8. Review / evaluation の読者観点

reviewer / evaluator はコメント数を評価しない。変更差分と change comprehension surface を読み、一般的な開発者が
次の問いへ局所的に答えられるかを確認する。

- この file / symbol / block は処理全体のどこを担当するか。
- 入力は何を意味し、どの表現や state へ変換されるか。
- なぜこの順序、分岐、待機、fallback が必要か。
- resource と非同期処理の owner は誰で、いつ終了するか。
- 失敗、欠損、timeout 時に何が起きるか。
- 次に読むべき具体的な処理はどこか。

答えるために複数 file の実装を広く逆解析する必要があり、命名・型・分割だけでも解消されていない場合は、
reader-oriented comment が不足している。新規・変更コードで「既存にもコメントがない」を根拠に省略している場合も
不適合とする。
