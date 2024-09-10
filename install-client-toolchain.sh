#!/bin/sh

set -e
set -x

NODEJS_VERSION='v20.17.0'
NODEJS_ARCH='linux-x64'

cd "$(dirname "${0}")"

if ! which npm > /dev/null; then
    curl -O "https://nodejs.org/dist/${NODEJS_VERSION}/node-${NODEJS_VERSION}-${NODEJS_ARCH}.tar.xz"
    tar xpf "node-${NODEJS_VERSION}-${NODEJS_ARCH}.tar.xz"
    mv "node-${NODEJS_VERSION}-${NODEJS_ARCH}" node
    PATH="$(pwd)/node/bin:${PATH}"
fi

cd "$(dirname "${0}")"/sincromisor-client
npm install
mkdir -p public/mediapipe-wasm
cp -r node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe-wasm
npm run build
