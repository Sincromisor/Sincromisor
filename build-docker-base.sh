#!/bin/sh

set -e

if [ ! -e ./Docker/env_vars/config.yml ]; then
    echo config.yml does not exist.
    exit 1
fi

exit 0

docker compose --profile base-image --build --force-recreate
