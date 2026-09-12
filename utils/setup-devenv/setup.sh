#!/usr/bin/env bash
# Ubuntu 26.04 / WSL2 にホストのツールとリポジトリ依存を導入する。
# 一般ユーザーで実行し、OS の変更だけ sudo に渡す。サービス起動は利用者が行う。
set -euo pipefail

usage() {
    cat <<'EOF'
使い方: bash utils/setup-devenv/setup.sh [--without-gpu] [--browser]
  --without-gpu  NVIDIA Toolkit の導入・GPU 確認を省く（会話の全系検証は不可）
  --browser      Playwright CLI と Google Chrome を追加する
  --help         この説明を表示する
既定: 開発ツール、Python 全サービス依存、Docker Engine / Compose、GPU 実行環境。
Windows 側の準備と導入後の起動方法は同じディレクトリの README.md を参照。
EOF
}

fail() {
    echo "エラー: $*" >&2
    exit 1
}

# 導入先を限定し、既存の別 Docker 構成を自動的に置き換えない。
check_host() {
    [[ $EUID -ne 0 ]] || fail 'sudo を付けず、開発に使う一般ユーザーで実行してください。'
    # shellcheck disable=SC1091
    source /etc/os-release
    [[ $ID == ubuntu && $VERSION_ID == 26.04 ]] || fail 'Ubuntu 26.04 が必要です。'
    [[ $(uname -m) == x86_64 ]] || fail 'x86_64 が必要です。'
    [[ $(uname -r) == *microsoft-standard-WSL2* ]] || fail 'WSL2 が必要です。'
    [[ $(cat /proc/1/comm) == systemd ]] || fail 'WSL の systemd を有効にして再起動してください。README.md を参照。'
    [[ ! -d /mnt/wsl/docker-desktop ]] || fail 'Docker Desktop の WSL 統合を無効にしてください。'
    local package
    for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
        if [[ $(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true) == 'install ok installed' ]]; then
            fail "競合パッケージ $package が存在します。利用状況を確認して手動で整理してください。"
        fi
    done
    if ((with_gpu)); then
        /usr/lib/wsl/lib/nvidia-smi || fail 'Windows 側の NVIDIA ドライバーと WSL の GPU 対応を確認してください。'
    fi
}

# OS 依存は Ubuntu 標準パッケージを使い、Docker のみ公式配布元を登録する。
install_system() {
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends software-properties-common ca-certificates curl gnupg
    sudo add-apt-repository -y universe
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends \
        git build-essential pkg-config nodejs npm golang-go python3-venv \
        ffmpeg opus-tools libopus-dev libsndfile1 libgl1 libglib2.0-0t64 \
        libsentencepiece-dev libprotobuf-dev protobuf-compiler unzip ripgrep shellcheck

    sudo install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$setup_tmp/docker.asc"
    sudo install -m 0644 "$setup_tmp/docker.asc" /etc/apt/keyrings/sincromisor-docker.asc
    cat > "$setup_tmp/docker.sources" <<'EOF'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: resolute
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/sincromisor-docker.asc
EOF
    sudo install -m 0644 "$setup_tmp/docker.sources" /etc/apt/sources.list.d/sincromisor-docker.sources
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker
}

# Windows が提供する GPU をコンテナへ渡す。Linux 用 GPU ドライバーは導入しない。
install_gpu() {
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey -o "$setup_tmp/nvidia.asc"
    gpg --batch --yes --dearmor -o "$setup_tmp/nvidia.gpg" "$setup_tmp/nvidia.asc"
    sudo install -m 0644 "$setup_tmp/nvidia.gpg" /etc/apt/keyrings/sincromisor-nvidia.gpg
    curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
        -o "$setup_tmp/nvidia.list"
    sed 's#deb https://#deb [signed-by=/etc/apt/keyrings/sincromisor-nvidia.gpg] https://#g' \
        "$setup_tmp/nvidia.list" > "$setup_tmp/nvidia-signed.list"
    sudo install -m 0644 "$setup_tmp/nvidia-signed.list" /etc/apt/sources.list.d/sincromisor-nvidia.list
    sudo apt-get update
    sudo apt-get install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
    sudo docker run --rm --gpus all nvidia/cuda:13.0.3-base-ubuntu24.04 nvidia-smi
}

# ロックを維持し、OS の Python と分離した 3.14 環境を作る。
# Go は標準の自動ツールチェーン選択で go.mod の指定版を取得する。
install_project() {
    export PATH="$HOME/.local/bin:$PATH"
    if ! command -v uv >/dev/null 2>&1; then
        curl -fsSL https://astral.sh/uv/install.sh -o "$setup_tmp/uv-install.sh"
        UV_INSTALL_DIR="$HOME/.local/bin" UV_NO_MODIFY_PATH=1 sh "$setup_tmp/uv-install.sh"
    fi
    uv python install "$(cat .python-version)"
    uv sync --locked --group dev --group full
    npm ci
    npm --prefix sincromisor-frontend ci
    mkdir -p sincromisor-frontend/public/mediapipe-wasm
    cp -r sincromisor-frontend/node_modules/@mediapipe/tasks-vision/wasm/. \
        sincromisor-frontend/public/mediapipe-wasm/
    (cd sincromisor-server/sincro-rtc && GOTOOLCHAIN=auto go mod download && GOTOOLCHAIN=auto go version)
    npm run git:hooks:install
    # 既存の設定・キャッシュには触れず、初回の保存先だけ準備する。
    if [[ ! -e .env && ! -L .env ]]; then
        install -m 0600 examples/compose.env .env
    fi
    if [[ ! -e volumes/sincro-cache && ! -L volumes/sincro-cache ]]; then
        sudo install -d -o 1001 -g 1001 volumes/sincro-cache
    fi
}

main() {
    local with_gpu=1 with_browser=0
    while (($#)); do
        case "$1" in
            --without-gpu) with_gpu=0 ;;
            --browser) with_browser=1 ;;
            --help|-h) usage; return ;;
            *) fail "不明な引数: $1" ;;
        esac
        shift
    done
    check_host
    cd "$(dirname "${BASH_SOURCE[0]}")/../.."
    [[ -f uv.lock && -f sincromisor-frontend/package-lock.json ]] || fail 'リポジトリ一式が必要です。'
    sudo -v
    setup_tmp=$(mktemp -d)
    trap 'rm -rf "$setup_tmp"' EXIT
    install_system
    if ((with_gpu)); then install_gpu; fi
    install_project
    if ((with_browser)); then
        npm install --global --prefix "$HOME/.local" @playwright/cli
        npm exec --yes --package=playwright -- playwright install --with-deps chrome
    fi
    sudo docker compose version
    sudo docker buildx version
    sudo docker info >/dev/null
    cat <<'EOF'
導入が完了しました。シェルで次を実行してください:
  export PATH="$HOME/.local/bin:$PATH"
必要なら上の PATH 設定を ~/.bashrc などに追加してください。
Docker は sudo docker で利用します（docker グループへの追加は行いません）。
.env の広告 IPv4 を編集し、README.md の手順で起動・検証してください。
EOF
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
