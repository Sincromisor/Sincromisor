#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

if ! which rye > /dev/null; then
    curl -sSf https://rye.astral.sh/get | RYE_INSTALL_OPTION='--yes' RYE_TOOLCHAIN_VERSION=cpython@3.10.14 bash
    . "$HOME/.rye/env"
fi
rye sync
