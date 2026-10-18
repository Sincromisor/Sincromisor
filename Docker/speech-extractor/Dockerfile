# syntax=docker/dockerfile:1
FROM ubuntu:24.04

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

ENV PATH=${SINCRO_USER_DIR}/.local/bin:${PATH}
ENV SINCROMISOR_CONF=/opt/sincromisor/config.yml

ENV SINCRO_EXTRACTOR_HOST=0.0.0.0
ENV SINCRO_EXTRACTOR_PORT=8002
ENV SINCRO_EXTRACTOR_PUBLIC_BIND_HOST=speech-extractor
ENV SINCRO_EXTRACTOR_PUBLIC_BIND_PORT=8002
ENV SINCRO_CONSUL_AGENT_HOST=sincro-consul-agent
ENV SINCRO_CONSUL_AGENT_PORT=8500

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
COPY --from=ghcr.io/astral-sh/uv:0.13.1 --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    /uv /uvx ${SINCRO_USER_DIR}/.local/bin/

# MediaPipeの実行時依存
# 音声分類器の共有ライブラリもEGL/GLESへリンクするため、GPU未使用でも必要。
# libegl1 / libgles2: libEGL.so.1 / libGLESv2.so.2
# libgl1: libGL.so.1
# libglib2.0-0t64: libgthread-2.0.so.0
USER root
# 基底イメージの自動削除を解除し、取得済みdebを排他キャッシュへ保持する。
RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update \
    && apt-get install --no-install-recommends -y libegl1 libgles2 libgl1 libglib2.0-0t64

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
    uv sync --locked --no-install-workspace --group speech-extractor

# 対象サービスと共通パッケージだけを配置し、他サービスの変更と依存同期を分離する。
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/sincro-config \
    ${SINCRO_USER_DIR}/sincromisor-server/sincro-config
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/sincro-models \
    ${SINCRO_USER_DIR}/sincromisor-server/sincro-models
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/speech-extractor \
    ${SINCRO_USER_DIR}/sincromisor-server/speech-extractor
# 分類器が作業ディレクトリから参照するYAMNetとライセンスを含める。
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-server/assets/3rd_party \
    ${SINCRO_USER_DIR}/sincromisor-server/assets/3rd_party

# ソース配置後もロックを検証してワークスペースを導入する。
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.cache,uid=1001,gid=1001 \
    uv sync --locked --group speech-extractor

WORKDIR ${SINCRO_USER_DIR}/sincromisor-server

# importだけでは検出できない共有ライブラリ不足を、分類器の初期化で検出する。
RUN uv run --no-sync python -c "from speech_extractor.SpeechExtractor import SpeechExtractorWorker; SpeechExtractorWorker.setup_model(); SpeechExtractorWorker.classifier.close()"

# 起動時は対象グループを含む導入済み環境をそのまま使う。
CMD ["uv", "run", "--no-sync", "speech-extractor/SpeechExtractorProcess.py"]
