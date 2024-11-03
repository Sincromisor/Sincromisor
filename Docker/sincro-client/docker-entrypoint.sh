#!/bin/bash

set -e

PATH="/opt/node/bin:${PATH}"

cd /opt/sincromisor
exec "$@"
