#!/bin/sh

set -e
set -x

if ! type npm > /dev/null; then
    echo npm is not found.
    echo https://nodejs.org/en/download/package-manager
    exit 1
fi

cd "$(dirname "${0}")"/../../sincromisor-frontend

npm install

NODE_ENV="production" NODE_OPTIONS="--max-old-space-size=2048" npm run build
