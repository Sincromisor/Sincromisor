FROM nvidia/cuda:12.8.0-cudnn-runtime-ubuntu24.04 AS builder

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

ENV PATH=${SINCRO_USER_DIR}/.local/bin:${PATH}

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
    && apt-get install -y curl git \
    llvm-14-dev libsentencepiece-dev libprotobuf-dev python3-dev build-essential

USER ${SINCRO_USER_ID}
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

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
    ./sincromisor-server/speech-recognizer-nemo/pyproject.toml \
    ./sincromisor-server/speech-recognizer-nemo/README.md \
    ./sincromisor-server/speech-recognizer-nemo/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/speech-recognizer-nemo/

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

# Sincromisorが依存している外部ライブラリをsyncする。
# sincromisor-server配下のモジュールは、空のまま依存関係だけ解決される。
# こうすることで、sincromisor-server配下のモジュールを書き換えた際に、外部モジュールを再syncする手間を省く。
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --group speech-recognizer-nemo

#------------------------------------------------------------
FROM nvidia/cuda:12.8.0-cudnn-runtime-ubuntu24.04 AS runner

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

ENV PATH=${SINCRO_USER_DIR}/.local/bin:${PATH}
ENV SINCROMISOR_CONF=/opt/sincromisor/config.yml

ENV SINCRO_RECOGNIZER_HOST=0.0.0.0
ENV SINCRO_RECOGNIZER_PORT=8003
ENV SINCRO_RECOGNIZER_PUBLIC_BIND_HOST=speech-recognizer-nemo
ENV SINCRO_RECOGNIZER_PUBLIC_BIND_PORT=8003
ENV SINCRO_CONSUL_AGENT_HOST=sincro-consul-agent
ENV SINCRO_CONSUL_AGENT_PORT=8500

ENV SINCRO_MINIO_PUBLIC_BIND_HOST=
ENV SINCRO_MINIO_PUBLIC_BIND_PORT=
ENV SINCRO_MINIO_ACCESS_KEY=
ENV SINCRO_MINIO_SECRET_KEY=

# SINCRO_RECOGNIZER_VOICE_LOG_DIRが空の場合、音声認識ログを出力しない
ENV SINCRO_RECOGNIZER_VOICE_LOG_DIR=

RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
    apt-get update && \
    apt-get install -y \
    libsentencepiece0 libprotobuf-c1 ffmpeg opus-tools curl

RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-server && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

WORKDIR ${SINCRO_USER_DIR}

COPY --from=builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ${SINCRO_USER_DIR}/.local \
    ${SINCRO_USER_DIR}/.local

COPY --from=builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ${SINCRO_USER_DIR}/.venv \
    ${SINCRO_USER_DIR}/.venv

COPY --from=builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ${SINCRO_USER_DIR}/.config \
    ${SINCRO_USER_DIR}/.config

COPY --from=builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ${SINCRO_USER_DIR}/README.md \
    ${SINCRO_USER_DIR}/pyproject.toml \
    ${SINCRO_USER_DIR}/uv.lock \
    ${SINCRO_USER_DIR}/.python-version \
    ${SINCRO_USER_DIR}/

# sincromisor-serverのソースコード一式をここでコピー
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server \
    ${SINCRO_USER_DIR}/sincromisor-server

USER ${SINCRO_USER_ID}
# sincromisor-serverのモジュールをビルドし直す
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --group speech-recognizer-nemo

WORKDIR ${SINCRO_USER_DIR}/sincromisor-server

CMD ["uv", "run", "speech-recognizer-nemo/SpeechRecognizerNemoProcess.py"]
