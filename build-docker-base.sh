#!/bin/sh

set -e

cd "$(dirname "${0}")"

if [ ! -e ./Docker/env_vars/config.yml ]; then
    echo config.yml does not exist.
    exit 1
fi

docker compose --profile base-image --build --force-recreate
