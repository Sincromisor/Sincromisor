#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

if [ ! -e config.yml ]; then
    cp examples/config.yml config.yml
fi

./install-client-toolchain.sh
./install-server-toolchain.sh
./install-client-assets.sh
./install-server-assets.sh
