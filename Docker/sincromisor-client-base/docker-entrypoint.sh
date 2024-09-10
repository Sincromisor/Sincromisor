#!/bin/bash

PATH="/opt/node/bin:${PATH}"

cd /opt/sincromisor
exec "$@"
