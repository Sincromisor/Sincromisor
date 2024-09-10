#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

mkdir -p sincromisor-server/assets/3rd_party
curl -o "sincromisor-server/assets/3rd_party/yamnet.tflite" \
    https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite
