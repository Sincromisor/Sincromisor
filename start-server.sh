#!/bin/sh

set -e

cd "$(dirname "${0}")/sincromisor-server"

if [ ! -e ../.env ]; then
    echo envfile $(realpath ../.env) is not found.
    exit 1
fi

uv run python3 Launcher.py --env-file ../.env
