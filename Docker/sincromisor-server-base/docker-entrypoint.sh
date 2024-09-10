#!/bin/bash

PATH="/opt/sincromisor/.rye/shims:${PATH}"

cd /opt/sincromisor
exec "$@"
