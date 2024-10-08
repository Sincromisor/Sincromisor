#!/bin/sh

set -e

if [ ! -e config.yml ]; then
    echo config.yml does not exist.
    exit 1
fi

docker compose --profile full-service create --build --force-recreate
