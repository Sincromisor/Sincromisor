#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

if ! which uv > /dev/null; then
    curl --proto '=https' --tlsv1.2 -LsSf https://github.com/astral-sh/uv/releases/download/0.4.17/uv-installer.sh | sh
    source $HOME/.cargo/env
fi
uv sync
