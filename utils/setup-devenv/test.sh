#!/usr/bin/env bash
# OS を変更せず、導入前の条件判定と引数による停止を確認する。
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=utils/setup-devenv/setup.sh
source ./setup.sh

bash ./setup.sh --help | grep -q '使い方'
if bash ./setup.sh --unknown >/dev/null 2>&1; then
    echo '不明な引数を拒否していません。' >&2
    exit 1
fi

# check_host の外部入力だけを置き換え、sudo やダウンロードへ進めない。
source() { ID=ubuntu; VERSION_ID=$test_version; }
uname() {
    if [[ $1 == -m ]]; then echo "$test_arch"; else echo "$test_kernel"; fi
}
cat() { echo "$test_init"; }
dpkg-query() { echo "$test_package_status"; }
test_version=26.04
test_arch=x86_64
test_kernel=6.6.87.2-microsoft-standard-WSL2
test_init=systemd
test_package_status='unknown ok not-installed'
with_gpu=0
if [[ $EUID == 0 || -d /mnt/wsl/docker-desktop ]]; then
    echo '条件判定テストは一般ユーザーかつ Docker Desktop 統合なしで実行してください。' >&2
    exit 1
fi
check_host
for assignment in test_version=24.04 test_arch=aarch64 test_kernel=linux test_init=init 'test_package_status=install ok installed'; do
    if (export "${assignment?}"; check_host) >/dev/null 2>&1; then
        echo "条件を拒否していません: $assignment" >&2
        exit 1
    fi
done
echo 'PASS: ヘルプ、不明な引数、対象環境、OS・CPU・WSL・systemd・競合パッケージの拒否'
