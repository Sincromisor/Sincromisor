#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")/../../"

if ! type uv > /dev/null; then
    echo uv is not found.
    echo https://docs.astral.sh/uv/getting-started/installation/
    exit 1
fi

uv sync --group full
