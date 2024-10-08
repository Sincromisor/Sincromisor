#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

if [ ! -e config.yml ]; then
    echo First create a config.yml
    echo You can use examples/config.yml as a reference.
    exit 1
fi

./install-client-toolchain.sh
./install-server-toolchain.sh
