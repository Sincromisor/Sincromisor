# syntax=docker/dockerfile:1
FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

ENV PATH=${SINCRO_USER_DIR}/.local/bin:${PATH}
ENV SINCROMISOR_CONF=/opt/sincromisor/config.yml

ENV SINCRO_PROCESSOR_HOST=0.0.0.0
ENV SINCRO_PROCESSOR_PORT=8004
ENV SINCRO_PROCESSOR_PUBLIC_BIND_HOST=text-processor
ENV SINCRO_PROCESSOR_PUBLIC_BIND_PORT=8004
ENV SINCRO_CONSUL_AGENT_HOST=sincro-consul-agent
ENV SINCRO_CONSUL_AGENT_PORT=8500
ENV SINCRO_PROCESSOR_MASTRA_URL=http://agent-server:4111
ENV SINCRO_PROCESSOR_MASTRA_TOKEN=
ENV SINCRO_PROCESSOR_MASTRA_AGENT_ID=sincromisor-character

WORKDIR ${SINCRO_USER_DIR}

RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-server && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

# curl: ComposeのHTTP死活確認
# git: ロックに含まれるReazonSpeechの取得に必要
# 基底イメージの自動削除を解除し、取得済みdebを排他キャッシュへ保持する。
RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates curl git

USER ${SINCRO_USER_ID}
# ビルドツールの更新で依存導入が変わらないよう、公式バイナリの版を固定する。
COPY --from=ghcr.io/astral-sh/uv:0.13.5 --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    /uv /uvx ${SINCRO_USER_DIR}/.local/bin/

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
# ソース未配置のワークスペースは後段で導入する。
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --locked --no-install-workspace --group text-processor

# 対象サービスと共通パッケージだけを配置し、他サービスの変更と依存同期を分離する。
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/sincro-config \
    ${SINCRO_USER_DIR}/sincromisor-server/sincro-config
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/sincro-models \
    ${SINCRO_USER_DIR}/sincromisor-server/sincro-models
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/text-processor \
    ${SINCRO_USER_DIR}/sincromisor-server/text-processor

# ソース配置後もロックを検証してワークスペースを導入する。
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --locked --group text-processor

WORKDIR ${SINCRO_USER_DIR}/sincromisor-server

# 起動時は対象グループを含む導入済み環境をそのまま使う。
CMD ["uv", "run", "--no-sync", "text-processor/TextProcessorProcess.py"]
