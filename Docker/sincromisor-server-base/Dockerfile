FROM nvidia/cuda:12.6.1-cudnn-devel-ubuntu24.04

ARG USER_ID=sincromisor

RUN apt-get update && \
    apt-get install -y curl xz-utils git fdkaac opus-tools libgl1 libglib2.0-bin libaio-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -u 1001 -s /bin/bash -d /opt/${USER_ID} -m ${USER_ID} && \
    mkdir /opt/${USER_ID}/.cache && \
    chown ${USER_ID}:${USER_ID} /opt/${USER_ID}/.cache && \
    mkdir /opt/${USER_ID}/sincromisor-server && \
    chown ${USER_ID}:${USER_ID} /opt/${USER_ID}/sincromisor-server

RUN --mount=type=cache,target=/opt/${USER_ID}/.cache \
    chown ${USER_ID}:${USER_ID} /opt/${USER_ID}/.cache

COPY --chown=${USER_ID}:${USER_ID} \
  ./pyproject.toml ./uv.lock ./.python-version \
  ./README.md ./Docker/sincromisor-server-base/docker-entrypoint.sh \
  /opt/${USER_ID}/

USER $USER_ID
RUN --mount=type=cache,target=/opt/${USER_ID}/.cache \
    cd /opt/${USER_ID} && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    PATH="/opt/sincromisor/.cargo/bin:$PATH" uv sync

VOLUME ["/opt/sincromisor/.cache"]
ENTRYPOINT [ "/opt/sincromisor/docker-entrypoint.sh" ]
# CMD ["/opt/sincromisor/start-server.sh"]
