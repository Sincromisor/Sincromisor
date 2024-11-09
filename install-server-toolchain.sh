#!/bin/sh

set -e
set -x

cd "$(dirname "${0}")"

if ! which uv >/dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
fi

PATH="${HOME}/.local/bin:${PATH}"

uv sync \
    --group sincro-rtc \
    --group speech-extractor \
    --group speech-recognizer \
    --group text-processor \
    --group voice-synthesizer
