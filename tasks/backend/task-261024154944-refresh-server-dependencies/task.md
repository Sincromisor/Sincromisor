# サーバーのPython・Go・AgentServer依存を更新する

## 背景 / 目的

ユーザー要求に基づき、サーバーの直接依存と関連する推移依存を公開安定版へ更新する。調査基準日は2026-10-24。

## 完了条件

- [x] Python workspace、RTCのGo、AgentServerのnpmについて公式配布元で更新候補を確認し、採用版と見送り理由を記録する。
- [x] 依存定義とロックファイルを同期し、既存の設定、認証、保存形式、通信契約を維持する。
- [x] Pythonのロック検査と対象テスト、Goの依存検査・テスト・ビルド、AgentServerの型検査・テスト・配布用ビルドが成功する。

## 変更範囲・判断

ルートと各Pythonサービスの`pyproject.toml`、`uv.lock`、RTCの`go.mod`と`go.sum`、AgentServerの`package.json`と`package-lock.json`を更新する。互換性修正は必要な箇所に限定する。Python 3.14、Go 1.26、AgentServerのNode 24系列を維持し、実行環境の版更新はDockerタスクで扱う。

既存の上限制約・セキュリティ対策を維持する。推移依存のメジャー更新やプレリリースを無条件に強制せず、採用できない版は根拠を記録する。稼働サービスと共有データの変更は行わない。

## 確認方法・文書同期

`uv lock --check`、対象グループの依存導入、既存Pythonテスト、`go mod verify`、`go test ./...`、`go build ./cmd/sincro-rtc`を行う。AgentServerは`npm ci`、`npm run check`、`npm test`、`npm run build`を行い、配布成果物のoverrideも確認する。

GPUによる実推論と外部LLM接続は利用できる環境に限り確認し、未実行範囲を明記する。設計に記載された採用版や導入条件が変わる場合のみ該当設計を同期する。

## 実装・確認結果

Pythonは65パッケージと関連するロック情報を更新した。主な直接依存は次のとおり。全差分は`uv.lock`で追跡できる。

| 依存                            | 更新前                  | 採用版                  |
| ------------------------------- | ----------------------- | ----------------------- |
| FastAPI / Starlette             | 0.143.0 / 1.7.0         | 0.162.0 / 1.9.0         |
| Pydantic                        | 2.14.0                  | 2.14.1                  |
| MediaPipe                       | 1.1.0                   | 1.1.1                   |
| boto3 / botocore                | 1.43.111                | 1.43.118                |
| SudachiDict-full                | 20260723.1              | 20261015                |
| websockets                      | 17.2                    | 17.3                    |
| httpx2                          | 2.13.1                  | 2.16.0                  |
| Ruff / ty                       | 0.17.0 / 0.0.86         | 0.17.2 / 0.0.91         |
| setuptools                      | 84.0.0                  | 84.2.1                  |
| Transformers                    | 5.19.0                  | 5.20.2                  |
| Hugging Face Hub                | 1.31.0                  | 1.33.0                  |
| Pion WebRTC / ICE / DTLS        | 4.2.23 / 4.4.7 / 3.1.10 | 4.2.25 / 4.4.8 / 3.1.15 |
| Pion interceptor / mediadevices | 0.1.49 / 0.10.0         | 0.1.51 / 0.10.1         |
| Pion RTCP / RTP                 | 1.2.19 / 1.10.5         | 1.2.20 / 1.10.6         |
| Prometheus common / procfs      | 0.72.0 / 0.22.0         | 0.72.1 / 0.23.0         |
| Mastra core / CLI               | 1.74.0 / 1.32.1         | 1.79.0 / 1.35.0         |
| Mastra Editor / Memory          | 0.15.6 / 1.35.0         | 0.16.4 / 1.39.0         |
| Mastra libSQL / MCP / loggers   | 1.25.0 / 2.1.2 / 1.3.4  | 1.27.0 / 2.5.0 / 1.3.9  |
| MCP SDK client / server         | 2.3.1 / 2.2.0           | 2.4.0 / 2.4.0           |
| Zod / Node 24型定義             | 4.6.5 / 24.19.1         | 4.6.7 / 24.19.2         |

MCP server SDKは親依存が2.2.0を要求するため、clientと同じ既存のoverride方式で2.4.0へ固定した。導入時に検出したMCPの高危険度の問題とHonoの問題を解消し、開発用・配布用の両方で`npm audit`は0件となった。配布成果物でもclient/server 2.4.0、Hono 4.13.13を確認した。tyの更新で非推奨となったcontextmanagerの戻り値注釈を2箇所で`Generator[None]`へ修正し、コメントを点検した。

`uv lock --check`、`uv sync --locked --group dev --group full`、全体の`ty check .`、Pythonの255試験・7サブテスト、注釈修正後の関連40試験が成功した。Pythonの1試験は既存の条件で省略された。最初の限定グループ導入時に失敗した4試験はNeMoパッケージ不足で、全グループの導入後に解消した。

Go 1.26.9で`go mod verify`、`go mod tidy -diff`、全パッケージの既存試験、RTCバイナリのビルドが成功した。AgentServerの`npm ci`、型検査、12試験、Studioを含む本番ビルドが成功した。

### 見送り・未確認

NeMo 3.0.0とReazonSpeechのコミットは維持した。W&B 0.31.0は新規依存cwevalsのベータ版を追加するため0.30.0を維持した。aistoreの再解決は既存1.26.0を1.25.0へ降格させたため、既存ロックを維持した。Hugging Face Hub 2、filelock 4、Pillow 13、xxhash 4への推移依存のメジャー移行は今回の保守更新に必要がなく見送った。OpenTelemetryの0.66b1依存は安定版1.45.1が厳密に要求する従来からの配布形態として採用した。

Ruffの全体検査には更新前0.17.0でも同じ67件の指摘があり、更新による新規指摘は0件だった。全体の整形検査では既存の過去タスク内2ファイルが不一致であり、変更したPythonファイルの整形は成功した。GPUによる実音声認識、外部LLMとの実会話、実ブラウザーの接続は未実行。

### 調査元

2026-10-24に[PyPI](https://pypi.org/)、[npm公式レジストリ](https://registry.npmjs.org/)、Go Module Proxyの各パッケージの公開情報・依存条件を確認した。ロック更新は[uv公式の更新方法](https://docs.astral.sh/uv/concepts/projects/sync/)に従った。
