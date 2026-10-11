# Dependabot警告の修正と更新制約の確認

## 背景 / 目的

2026-10-11に[Dependabot警告](https://github.com/Sincromisor/Sincromisor/security/dependabot)をGitHub APIで取得し、未解決28件を確認した。ユーザーの依頼に従い、修正版へ更新できる依存を修正し、NeMoなどの互換性制約で更新できない警告を記録する。

## 完了条件

- [x] 修正版へ更新可能な依存を更新し、対象の依存解決・ビルド・既存テストで確認する。
- [x] 配布成果物にもMCPクライアントの修正版を反映する。
- [x] 残る警告の依存制約、修正版の有無、再対応条件を記録する。

## 方針と変更範囲

Pythonの既存の`constraint-dependencies`へ修正下限を指定し、`uv.lock`を更新する。NeMo、ReazonSpeech、Torch、現行Transformersの版とGit参照は維持する。npmは警告対象と、その更新に必要な親依存だけを変更する。廃止済みNue-ASRの削除や互換性を確認できない強制更新は含めない。

通信契約とサービスの機能は変更しない。Mastraの配布処理については[AgentServer設計](../../../documents/design/backend/services/agent-server.md)を同期する。

## 修正した12件

| 警告番号         | 更新対象                       | 更新前 → 更新後 |
| ---------------- | ------------------------------ | --------------- |
| #245             | Werkzeug                       | 3.1.8 → 3.1.9   |
| #244             | multidict                      | 6.8.0 → 6.9.1   |
| #235、#236、#237 | urllib3                        | 2.7.0 → 2.8.0   |
| #242             | `@modelcontextprotocol/client` | 2.0.0 → 2.2.0   |
| #241             | `@modelcontextprotocol/sdk`    | 1.30.0 → 1.32.1 |
| #233             | fast-uri                       | 3.1.7 → 3.1.8   |
| #231             | brace-expansion                | 5.0.9 → 5.0.12  |
| #232             | brace-expansion                | 1.1.18 → 1.1.21 |
| #225             | tsx配下のesbuild               | 0.27.7 → 0.28.2 |
| #238             | source-map-js                  | 1.2.1 → 1.2.2   |

`tsx`は4.21.0から4.22.0へ更新し、既存のesbuild 0.28.2と共通化した。重複していた旧esbuildと各環境用バイナリーがロックから削除される。

### MCPの固定依存と配布処理

`@mastra/mcp 1.17.3`はクライアント2.0.0を固定している。npmメタデータで1.18.0および最新2.2.0も同じ固定を確認したため、親の不要な更新を避け、`overrides`を`@mastra/mcp`配下のクライアントだけに限定する。修正版が要求するcore 2.2.0はその配下へ導入され、既存サーバー側のcore 2.0.0と分離される。

Mastraのビルドは出力依存定義ファイルへ`overrides`をコピーせず、配布用依存の再導入でクライアント2.0.0に戻ることを再現した。`build`スクリプトの後半でプロジェクトの上書き指定をコピーし、配布側のロックと導入済みパッケージも更新する。ローカルの`ignore-scripts=true`でも省略されないよう、npmのライフサイクルフックに依存せず明示的に実行する。後処理の失敗はビルド失敗として伝播する。Dockerfileもこの後処理をコピーする。

Mastraが修正版を標準採用した時点で上書きを外し、ほかの上書きがなければ後処理も削除できる。更新元の指定はプロジェクトの`package.json`だけに置く。

## 残る16件と再対応条件

### NeMo由来の4件

`uv lock --dry-run --upgrade-package '<対象>=<修正下限>'`で次の競合をそれぞれ確認した。上流の制約を強制的に上書きしない。

- #191、#246: hydra-core 1.3.2。NeMo 3.0.0のASR依存は`hydra-core>1.3,<=1.3.2`で、修正下限1.3.4 / 1.3.6を許可しない。
- #226: lightning 2.4.0。NeMo 3.0.0のASR依存は`lightning>2.2.1,<=2.4.0`で、修正版2.6.6を許可しない。別パッケージの`pytorch-lightning`は既に2.6.6だが、この警告は解消しない。
- #243: fsspec 2025.12.0。上記Lightningの依存は`fsspec[http]>=2022.5.0,<2026.0`で、修正版2026.6.0を許可しない。

再対応には修正版を許容するNeMoの公開版と、ReazonSpeechによるモデル読み込み・実音声認識の互換性確認が必要となる。

### 旧音声認識のTransformers 11件

#18、#19、#20、#27、#28、#29、#86、#143、#146、#210、#234は、すべて`sincromisor-server/speech-recognizer/pyproject.toml`の`transformers==4.51.3`が対象である。現行NeMoの`uv.lock`は既に5.17.0で、今回取得したTransformers警告の対象ではない。

旧サービスはworkspace外で、[設計索引](../../../documents/design/index.md)ではNue-ASRを廃止済みとしている。依存定義ファイルには4.52.3で`GPTNeoXAttention.hidden_size`が欠落する互換性不具合が記録されているため、版番号だけの更新はしない。旧実装を正式に削除するか、Nue-ASRとDeepSpeedで修正版の読み込み・推論を確認してから再対応する。#234は取得時点で修正版表示がない。

### sprintf-js 1件

#240は`@mastra/core → gray-matter → js-yaml 3 → argparse 1 → sprintf-js 1.0.3`の依存経路にある。[警告](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)は外部から指定された書式文字列の精度による例外を扱う。npm最新の1.1.3も対象で修正版は未公開だった。上流の修正版、またはこの依存経路を除去した互換性のある親依存の公開後に更新する。

これらを解消済み・到達不能とは判定せず、GitHub上の警告も手動で却下しない。修正した警告は既定ブランチへの反映後に再評価される。

## 確認結果

- AgentServerの`npm run check`: 成功。`npm test`: MCPの一覧・認証・呼出し・失敗・取消、会話の分離など9件成功。初回はサンドボックスのローカル待受拒否とNodeの異常終了が発生し、待受を許可した同じテストの再実行は全件成功した。
- AgentServerの`npm run build`: 成功。配布用ロックと導入実体でもMCPクライアント2.2.0 / SDK 1.32.1を確認した。
- フロントの`npm run build`: 成功。`npm audit`は0件。
- Python 3.14の隔離環境で更新した3パッケージを導入し、multidictの大文字小文字を無視した複数値取得・集合演算、Werkzeugのパス逸脱拒否、urllib3のローカルHTTP分割圧縮応答の展開を確認した。圧縮展開は`decode_content=True`を明示する。
- `uv audit --locked`: fsspec、Hydra、Lightningの7レコードが残る。HydraとLightningにはGHSA/PYSECの重複が含まれ、Lightningの`PYSEC-2026-3972`は修正版表示なし。更新した3パッケージと現行Transformersへの指摘はない。
- AgentServerの`npm audit`: 17件（中11、高6）が残る。根本の指摘はsprintf-jsと、追加で検出された[bracesの深い入れ子によるサービス拒否](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)の2件で、残りは親依存への波及。bracesも修正版なしで、Mastraのビルド依存に含まれる。監査が提案する旧Mastraへの後退は採用しない。

- `uv lock --check --offline`、変更したJS/JSONのBiome、MarkdownのPrettier、`git diff --check`、タスク状態・索引検査: 成功。

未実行: GPUを用いた実音声認識、実LLMとの会話、Dockerイメージのビルド。NeMoの中核依存は変更せず、Pythonは更新したパッケージの基本動作と全workspaceの依存解決、AgentServerは既存接続テストと本番用の配布ビルドを検証範囲とした。
