FROM nvidia/cuda:13.0.3-cudnn-runtime-ubuntu24.04 AS builder

# Composeからのモデル指定を依存導入前に検証する。
ARG SINCRO_RECOGNIZER_MODEL=nemo
RUN test "$SINCRO_RECOGNIZER_MODEL" = nemo || \
    { echo "未対応のSINCRO_RECOGNIZER_MODELです。nemoを指定してください。" >&2; exit 1; }

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

ENV PATH=${SINCRO_USER_DIR}/.local/bin:${PATH}

WORKDIR ${SINCRO_USER_DIR}

RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-server && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

# curl: uvのインストール
# git: ロックに含まれるReazonSpeechの取得に必要
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
    ./sincromisor-server/speech-extractor/pyproject.toml \
    ./sincromisor-server/speech-extractor/README.md \
    ./sincromisor-server/speech-extractor/.python-version \
    ${SINCRO_USER_DIR}/sincromisor-server/speech-extractor/

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

# ロックの整合性を検証し、外部依存だけを導入する。
# ソース変更で外部依存を再導入しないよう、ワークスペースの導入は後段へ分ける。
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --locked --no-install-workspace --group speech-recognizer-nemo

#------------------------------------------------------------
FROM nvidia/cuda:13.0.3-cudnn-runtime-ubuntu24.04 AS runner

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

ENV SINCRO_S3_PUBLIC_BIND_HOST=
ENV SINCRO_S3_PUBLIC_BIND_PORT=
ENV SINCRO_S3_ACCESS_KEY=
ENV SINCRO_S3_SECRET_KEY=

# SINCRO_RECOGNIZER_VOICE_LOG_DIRが空の場合、音声認識ログを出力しない
ENV SINCRO_RECOGNIZER_VOICE_LOG_DIR=

# PyTorchのTriton演算は実行時にC拡張を生成するため、コンパイラーとPython開発用ヘッダーが必要。
RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
    apt-get update && \
    apt-get install -y \
    libsentencepiece0 libprotobuf-c1 ffmpeg opus-tools curl gcc python3-dev

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
# ソース配置後もロックを検証してワークスペースを導入する。
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --locked --group speech-recognizer-nemo

WORKDIR ${SINCRO_USER_DIR}/sincromisor-server

# 起動時は対象グループを含む導入済み環境をそのまま使う。
CMD ["uv", "run", "--no-sync", "speech-recognizer-nemo/SpeechRecognizerNemoProcess.py"]
