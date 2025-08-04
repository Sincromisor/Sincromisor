FROM ubuntu:24.04

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

ENV PATH=${SINCRO_USER_DIR}/.local/bin:${PATH}
ENV SINCRO_MINIO_ROOT_USER=
ENV SINCRO_MINIO_ROOT_PASSWORD=

WORKDIR ${SINCRO_USER_DIR}

RUN \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        python3 && \
    rm -rf /var/lib/apt/lists/*

RUN curl -L -o /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc && \
    chmod +x /usr/local/bin/mc

RUN \
    useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-server && \
    mkdir ${SINCRO_USER_DIR}/configs && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

USER ${SINCRO_USER_ID}
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN \
    uv init --no-readme && \
    uv add 'huggingface-hub[cli]' && \
    rm main.py

USER root
COPY ./Docker/service-initializer/initialize.sh ${SINCRO_USER_DIR}
RUN chown ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}/initialize.sh

CMD ["/opt/sincromisor/initialize.sh"]
