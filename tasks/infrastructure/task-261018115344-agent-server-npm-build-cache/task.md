# AgentServerの依存導入にnpmキャッシュを追加する

## 背景 / 目的

2026-10-18、HEAD `d9e4916b` の [AgentServer Dockerfile](../../../Docker/agent-server/Dockerfile) を調査した。
依存ファイルを先にコピーする順序とマルチステージ化は導入済みだが、`npm ci` にキャッシュマウントがない。
ロック更新で依存導入レイヤーを作り直す場合に、既存パッケージの取得キャッシュを再利用する。

## 完了条件

- [x] ビルド段階の `npm ci --no-audit --no-fund` が、実行ユーザーに対応するnpmキャッシュマウントを使う。
- [x] ロックファイルに基づく依存導入とMastraビルドが成功し、既存の依存上書き処理を維持する。
- [x] キャッシュは実行イメージへコピーせず、成果物の配置・非root実行・起動コマンドを維持する。

## 変更範囲・実装方針

変更対象は上記Dockerfile。必要ならDockerfile構文指定を加え、rootで行う依存導入には `/root/.npm` を使う。
[AgentServerのCompose定義](../../../compose/agent-server.yml) が使うサブディレクトリのビルドコンテキストを維持する。
依存版の更新、npmコマンドの変更、他サービスへの共通化、キャッシュ用の新サービスは含めない。

## 確認方法

対象のビルド段階と最終イメージをビルドし、npm・Mastraの処理成功と成果物配置を確認する。
キャッシュがマウント先に作られ、最終イメージのコピー範囲へ入らないことを確認する。
キャッシュを確認するための追加処理は依存導入段階に限定し、不要な全体再ビルドや速度目標は追加しない。

## 文書同期・実行上の制約

公開契約は変わらず、設計文書の変更は原則不要。結果は本タスクへ記録する。
容量確認・作成物の記録・後片付けは [Docker Compose管理ルール](../../../documents/rules/docker-compose.md) に従う。

## 実装・確認結果

Dockerfileの構文指定とroot用/root/.npmキャッシュマウントを追加した。npm ci --no-audit --no-fund、依存版、Mastraビルドと依存上書き処理、Composeのサブディレクトリコンテキストは維持した。

ビルド段階・最終段階をビルドし、npmとMastraの処理成功、_cacacheの存在、.mastra/outputとstart.mjsの配置、UID 1000を確認した。最終段階の/root/.npm・/home/node/.npm・/app/.npmは存在せず、実行側へのコピー範囲にキャッシュが入らない。CMDは既存のnode start.mjsを維持した。コメント点検: PASS。

defaultビルダー、unix:///var/run/docker.sock、linux/amd64、--output type=cacheonlyを使用した。新規イメージタグ・ID・永続コンテナはない。開始時のキャッシュ114.6GB、空き142GB。キャッシュは既存GCの下で通常ビルドに再利用する。

終了時のキャッシュは115.6GB（約1.0GB増加）、空き141GBである。
