FROM hashicorp/consul:latest AS consul

FROM ubuntu:24.04

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

EXPOSE 50021

ARG VOICEVOX_VERSION=0.24.1

ENV SINCRO_VOICEVOX_HOST=0.0.0.0
ENV SINCRO_VOICEVOX_PORT=50021
ENV SINCRO_CONSUL_AGENT_HOST=consul-agent-synthesizer
ENV SINCRO_CONSUL_AGENT_PORT=8500

COPY --from=consul --chown=root:root --chmod=755 \
    /bin/consul \
    /bin/consul

RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
    apt-get update && \
    apt-get install -y curl p7zip libsndfile1 && \
    useradd -s /bin/bash -d /opt/voicevox voicevox 

RUN --mount=type=cache,target=/mnt \
    cd /opt && \
    test -e /mnt/voicevox-${VOICEVOX_VERSION}.7z || \
    curl -L -o /mnt/voicevox-${VOICEVOX_VERSION}.7z \
    "https://github.com/VOICEVOX/voicevox_engine/releases/download/${VOICEVOX_VERSION}/voicevox_engine-linux-cpu-x64-${VOICEVOX_VERSION}.7z.001" && \
    7zr x  /mnt/voicevox-${VOICEVOX_VERSION}.7z && \
    mv linux-cpu-x64 voicevox && \
    chmod +x /opt/voicevox/run && \
    mkdir /opt/voicevox/.local && \
    chown voicevox:voicevox /opt/voicevox/.local 

COPY --chown=root:root --chmod=755 \
    ./Docker/common/service-register.sh \
    /service-register.sh
COPY --chown=root:root --chmod=755 \
    ./Docker/voicevox/start-voicevox.sh \
    /start-voicevox.sh
COPY --chown=voicevox:voicevox --chmod=755 \
    ./Docker/voicevox/voicevox-template.json \
    /opt/voicevox/.local/voicevox-template.json

USER voicevox
CMD ["/start-voicevox.sh"]
