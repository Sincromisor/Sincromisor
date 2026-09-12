# WSL2 の開発・動作検証環境

## 目的

プレーンな Ubuntu 26.04（x86_64）の WSL2 に、Sincromisor の開発とローカル動作検証に必要なものを導入する。Docker Engine は WSL 内で動かす。導入中はインターネット接続と `sudo` が必要となり、Python 全サービス依存や CUDA 関連パッケージの取得には大きな空き容量と時間を要する。

## Windows 側の準備

1. Windows の管理者 PowerShell で `wsl --update` を実行する。`wsl --list --online` で表示される Ubuntu 26.04 の名前を使って `wsl --install -d <名前>` で導入し、一般ユーザーを作る。`wsl -l -v` で VERSION が `2` であることを確認する。
2. GPU を使う場合は Windows 側に CUDA 13 対応の NVIDIA ドライバーを導入する。プロジェクトの[GPU 条件](../../documents/design/infrastructure/compose.md#nemoのgpu基盤)も確認する。WSL 内に `nvidia-driver-*`、`nvidia-open`、`cuda-drivers` は導入しない。
3. Ubuntu で `cat /proc/1/comm` が `systemd` になることを確認する。異なる場合は `/etc/wsl.conf` の既存設定を保持して `[boot]` 節に `systemd=true` を設定し、PowerShell の `wsl --shutdown` 後に Ubuntu を開き直す。
4. Docker Desktop のこのディストリビューションへの WSL 統合は無効にする。既存の別 Docker パッケージがある場合、スクリプトは削除せず停止する。

WSL の再起動は他の WSL 作業も終了するため、作業を保存してから行う。

## 実行

Ubuntu 内でソースを取得する。Windows の `/mnt/c` 配下ではなく、Linux 側のホームディレクトリを使用する。

```sh
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Sincromisor/Sincromisor.git ~/Sincromisor
cd ~/Sincromisor
bash utils/setup-devenv/setup.sh
export PATH="$HOME/.local/bin:$PATH"
```

`PATH` 設定は必要に応じて `~/.bashrc` などへ追加する。スクリプト全体には `sudo` を付けない。

| 指定            | 動作                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 指定なし        | 開発ツール、全サービスの Python 依存、Docker、NVIDIA Container Toolkit を導入し、CUDA コンテナで GPU を確認する          |
| `--without-gpu` | Toolkit 導入と GPU 確認を省く。GPU のない環境で静的検査・単体テストなどを行う場合に使う。Python 全サービス依存は導入する |
| `--browser`     | Playwright CLI を `~/.local` に、Google Chrome とブラウザー用 OS 依存を追加する。ほかの指定と併用できる                  |

Ubuntu 標準の Node.js / npm、Go、C/C++ ビルドツール、FFmpeg、Opus、音声処理ライブラリ、Git、ripgrep、ShellCheck を導入する。Python は uv で `.python-version` の 3.14 を用意し、`uv sync --locked --group dev --group full` を実行する。Go の必要バージョンは `go.mod` と標準の自動ツールチェーン取得に従う。

ルートとフロントエンドで `npm ci` を実行し、MediaPipe の WASM を配置する。`.env` とモデルキャッシュ用ディレクトリは存在しない場合だけ作る。再実行できるが、`node_modules` と Python 仮想環境はロックに同期され、Docker の GPU 設定時はデーモンを再起動する。APT リポジトリは `sincromisor-*` 名で登録する。既存環境への移植・他方式との混在は対象外とする。

Docker グループへの自動追加は行わない。以降の Docker 操作には `sudo docker` を使う。Compose のサービス、認識モデル、Dify、LLM、VRM 素材はこのスクリプトでは起動・取得しない。

## 導入後の確認と起動

リポジトリのルートで、変更対象に応じて以下を実行する。

```sh
npm --prefix sincromisor-frontend run build
npm --prefix sincromisor-frontend test
uv run --group dev --group full ruff check .
uv run --group dev --group full ty check .
uv run --group dev --group full pytest
(cd sincromisor-server/sincro-rtc && GOTOOLCHAIN=auto go test ./...)
```

会話の確認では、[起動手順](../../README.md#とにかくローカル環境でサーバーを動かす)に従って `.env` の広告 IPv4 などを編集し、`sudo docker compose pull`（ソースから作る場合は `sudo docker compose build`）、`sudo docker compose up -d` を実行する。Windows 側のブラウザーで `http://localhost:8086` を開き、マイク・カメラを許可する。Dify 未配置なら開始前に `sincro` モードを選ぶ。

HTTP が開けても WebRTC の UDP が到達するとは限らない。既定の WSL NAT では Windows から到達できる WSL の IPv4 を広告し、再起動で変わった場合は `.env` を更新する。LAN の別端末から確認する場合は、Windows 11 の WSL ミラーネットワーク、Windows / Hyper-V ファイアウォール、HTTPS を別途設定し、TCP 8001 と `.env` のメディア UDP ポートへの到達性を確認する。TCP 用の `netsh interface portproxy` だけでは UDP を中継できない。スクリプトはネットワークやファイアウォールを変更しない。

`--browser` を指定した場合は `playwright-cli open http://localhost:8086 --browser=chrome` で画面を確認し、`playwright-cli close` で終了する。実マイク・カメラの会話確認は Windows 側のブラウザーで行う。

スクリプト自体の確認は `bash -n utils/setup-devenv/setup.sh`、`shellcheck utils/setup-devenv/*.sh`、`bash utils/setup-devenv/test.sh` で行う。Ubuntu 26.04 / WSL2 での一括導入と実 GPU・ブラウザーでの動作は、この変更の作成環境では未検証である。

## 参照元

2026-09-13 に公式手順を確認した。採用範囲は次のとおり。

- [Ubuntu の Node.js](https://packages.ubuntu.com/resolute/nodejs): 標準の Node.js 22 を利用する。
- [Docker Engine](https://docs.docker.com/engine/install/ubuntu/): Ubuntu 26.04 向け公式 APT、Compose、Buildx を導入する。
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html): 安定版 APT と Docker ランタイム設定を利用する。
- [CUDA on WSL](https://docs.nvidia.com/cuda/wsl-user-guide/index.html): Windows ドライバーを利用し、Linux ドライバーを追加しない。
- [WSL の systemd](https://learn.microsoft.com/en-us/windows/wsl/systemd)、[WSL ネットワーク](https://learn.microsoft.com/en-us/windows/wsl/networking): Windows 側の手動準備と接続条件を確認する。
- [uv](https://docs.astral.sh/uv/getting-started/installation/)、[Go ツールチェーン](https://go.dev/doc/toolchain)、[Playwright CLI](https://github.com/microsoft/playwright-cli): 公式の導入とバージョン選択機能を使う。
