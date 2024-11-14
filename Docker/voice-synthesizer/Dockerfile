FROM ubuntu:24.04

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

ENV PATH=${SINCRO_USER_DIR}/.cargo/bin:${SINCRO_USER_DIR}/.local/bin:${PATH}
ENV SINCROMISOR_CONF=/opt/sincromisor/config.yml
ENV SINCROMISOR_WORKER_ID=1

ENV SINCRO_SYNTHESIZER_HOST=0.0.0.0
ENV SINCRO_SYNTHESIZER_PORT=8005
ENV SINCRO_SYNTHESIZER_PUBLIC_BIND_HOST=voice-synthesizer
ENV SINCRO_SYNTHESIZER_PUBLIC_BIND_PORT=8005
ENV SINCRO_REDIS_HOST=sincro-voice-cache
ENV SINCRO_REDIS_PORT=6379
ENV SINCRO_SYNTHESIZER_VOICEVOX_HOST=sincro-voicevox
ENV SINCRO_SYNTHESIZER_VOICEVOX_PORT=50021
ENV SINCRO_SYNTHESIZER_VOICEVOX_DEFAULT_STYLE_ID=0

WORKDIR ${SINCRO_USER_DIR}

RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-server && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

# curl: uvのインストール
# git: nue-asrのインストール。nue-asrが不要なコンテナでも無いとsyncでコケる
RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
    apt-get update \
    && apt-get install -y curl git

USER ${SINCRO_USER_ID}
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

#USER root
#RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
#    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
#    apt-get install -y fdkaac opus-tools

USER ${SINCRO_USER_ID}
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./pyproject.toml \
    ./uv.lock \
    ./.python-version \
    ./README.md \
    ${SINCRO_USER_DIR}/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/sincro-config/pyproject.toml \
    ./sincromisor-server/sincro-config/README.md \
    ./sincromisor-server/sincro-config/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/sincro-config/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/sincro-models/pyproject.toml \
    ./sincromisor-server/sincro-models/README.md \
    ./sincromisor-server/sincro-models/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/sincro-models/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/sincro-rtc/pyproject.toml \
    ./sincromisor-server/sincro-rtc/README.md \
    ./sincromisor-server/sincro-rtc/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/sincro-rtc/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/speech-extractor/pyproject.toml \
    ./sincromisor-server/speech-extractor/README.md \
    ./sincromisor-server/speech-extractor/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/speech-extractor/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/speech-recognizer/pyproject.toml \
    ./sincromisor-server/speech-recognizer/README.md \
    ./sincromisor-server/speech-recognizer/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/speech-recognizer/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/text-processor/pyproject.toml \
    ./sincromisor-server/text-processor/README.md \
    ./sincromisor-server/text-processor/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/text-processor/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/voice-synthesizer/pyproject.toml \
    ./sincromisor-server/voice-synthesizer/README.md \
    ./sincromisor-server/voice-synthesizer/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/voice-synthesizer/

# 一旦依存ライブラリをsyncする
# sincromisor-serverのモジュールは、空のまま依存関係だけ解決される
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --group voice-synthesizer

# sincromisor-serverのソースコード一式をここでコピー
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server \
    ${SINCRO_USER_DIR}/sincromisor-server

# sincromisor-serverのモジュールをビルドし直す
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --group voice-synthesizer

WORKDIR ${SINCRO_USER_DIR}/sincromisor-server

CMD uv run voice-synthesizer/VoiceSynthesizerProcess.py \
    --host "${SINCRO_SYNTHESIZER_HOST}" \
    --port "${SINCRO_SYNTHESIZER_PORT}" \
    --public-bind-host "${SINCRO_SYNTHESIZER_PUBLIC_BIND_HOST}" \
    --public-bind-port "${SINCRO_SYNTHESIZER_PUBLIC_BIND_PORT}" \
    --redis-host "${SINCRO_REDIS_HOST}" \
    --redis-port "${SINCRO_REDIS_PORT}" \
    --voicevox-host "${SINCRO_SYNTHESIZER_VOICEVOX_HOST}" \
    --voicevox-port "${SINCRO_SYNTHESIZER_VOICEVOX_PORT}" \
    --voicevox-default-style-id "${SINCRO_SYNTHESIZER_VOICEVOX_DEFAULT_STYLE_ID}"
