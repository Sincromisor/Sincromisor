#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

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
