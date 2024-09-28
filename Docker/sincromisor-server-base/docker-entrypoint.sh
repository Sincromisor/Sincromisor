#!/bin/bash

PATH="/opt/sincromisor/.cargo/bin:${PATH}"

cd /opt/sincromisor
exec "$@"
