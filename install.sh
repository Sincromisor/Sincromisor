#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

NODEJS_VERSION='v20.17.0-linux-x64'
FONTS="BIZUDPGothic-Regular.woff2
BIZUDPGothic-Bold.woff2
BIZUDPMincho-Regular.woff2
BIZUDMincho-Regular.woff2
BIZUDGothic-Regular.woff2
BIZUDGothic-Bold.woff2"

mkdir -p src/assets/3rd_party
mkdir -p src/assets/3rd_party/characters
mkdir -p sincromisor-client/public/3rd_party/fonts

for FONT_NAME in ${FONTS}; do
    curl -o "sincromisor-client/public/3rd_party/fonts/${FONT_NAME}" "https://docs.negix.org/files/fonts/${FONT_NAME}"
done

curl -o "sincromisor-client/public/3rd_party/blaze_face_short_range.tflite" \
    https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite

curl -o "src/assets/3rd_party/yamnet.tflite" \
    https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite

curl -sSf https://rye.astral.sh/get | RYE_INSTALL_OPTION='--yes' RYE_TOOLCHAIN_VERSION=cpython@3.10.14 bash
. "$HOME/.rye/env"
rye sync

curl -O "https://nodejs.org/dist/v20.17.0/node-${NODEJS_VERSION}.tar.xz"
tar xpf "node-${NODEJS_VERSION}.tar.xz"
mv "node-${NODEJS_VERSION}" node
PATH="$(pwd)/node/bin:${PATH}"

if [ ! -e config.yml ]; then
    cp examples/config.yml config.yml
fi

cd "$(dirname "${0}")"/sincromisor-client
npm install
mkdir -p public/mediapipe-wasm
cp -r node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe-wasm
npm run build
