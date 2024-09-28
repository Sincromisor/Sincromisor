#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

if ! which uv > /dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    . "${HOME}/.cargo/env"
fi

uv sync
