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

mkdir -p sincromisor-client/public/3rd_party/fonts

for FONT_NAME in ${FONTS}; do
    curl -o "sincromisor-client/public/3rd_party/fonts/${FONT_NAME}" "https://docs.negix.org/files/fonts/${FONT_NAME}"
done

curl -o "sincromisor-client/public/3rd_party/blaze_face_short_range.tflite" \
    https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite

curl -O "https://nodejs.org/dist/v20.17.0/node-${NODEJS_VERSION}.tar.xz"
tar xpf "node-${NODEJS_VERSION}.tar.xz"
mv "node-${NODEJS_VERSION}" node
PATH="$(pwd)/node/bin:${PATH}"

cd "$(dirname "${0}")"/sincromisor-client
npm install
mkdir -p public/mediapipe-wasm
cp -r node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe-wasm
npm run build
