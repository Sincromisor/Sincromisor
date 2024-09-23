#!/bin/sh

set -e
set -x

NODEJS_VERSION='v20.17.0'
NODEJS_ARCH='linux-x64'

cd "$(dirname "${0}")"

if which npm > /dev/null; then
    echo 'npm found.'
elif [ -x "$(pwd)/node/bin/npm" ]; then
    PATH="$(pwd)/node/bin:${PATH}"
else
    curl -O "https://nodejs.org/dist/${NODEJS_VERSION}/node-${NODEJS_VERSION}-${NODEJS_ARCH}.tar.xz"
    tar xpf "node-${NODEJS_VERSION}-${NODEJS_ARCH}.tar.xz"
    mv "node-${NODEJS_VERSION}-${NODEJS_ARCH}" node
    PATH="$(pwd)/node/bin:${PATH}"
fi

cd "$(dirname "${0}")"/sincromisor-client
npm install
mkdir -p public/mediapipe-wasm
cp -r node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe-wasm
NODE_OPTIONS="--max-old-space-size=2048" npm run build
