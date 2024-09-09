#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

./install-client.sh
./install-server.sh

if [ ! -e config.yml ]; then
    cp examples/config.yml config.yml
fi
