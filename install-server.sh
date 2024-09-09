#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

mkdir -p sincromisor-server/assets/3rd_party
mkdir -p sincromisor-server/assets/3rd_party/characters

curl -o "sincromisor-server/assets/3rd_party/yamnet.tflite" \
    https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite

curl -sSf https://rye.astral.sh/get | RYE_INSTALL_OPTION='--yes' RYE_TOOLCHAIN_VERSION=cpython@3.10.14 bash
. "$HOME/.rye/env"
rye sync
