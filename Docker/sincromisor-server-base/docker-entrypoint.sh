#!/bin/bash

set -e

PATH="/opt/sincromisor/.cargo/bin:${PATH}"

cd /opt/sincromisor
exec "$@"
