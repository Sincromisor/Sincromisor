#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

./setup-server.sh
./setup-client.sh
