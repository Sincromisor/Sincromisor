FROM ubuntu:24.04

ARG USER_ID=sincromisor
ARG NODEJS_VERSION=v20.17.0
ARG NODEJS_ARCH=linux-x64
ARG CADDY_VERSION=2.8.4
ARG CADDY_ARCH=linux_amd64

RUN apt-get update && \
    apt-get install -y curl xz-utils git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -u 1001 -s /bin/bash -d /opt/${USER_ID} -m ${USER_ID} && \
    mkdir /opt/${USER_ID}/sincromisor-client && \
    chown ${USER_ID}:${USER_ID} /opt/${USER_ID}/sincromisor-client && \
    cd /opt && \
    curl -O "https://nodejs.org/dist/${NODEJS_VERSION}/node-${NODEJS_VERSION}-${NODEJS_ARCH}.tar.xz" && \
    tar xpf "node-${NODEJS_VERSION}-${NODEJS_ARCH}.tar.xz" && \
    mv "node-${NODEJS_VERSION}-${NODEJS_ARCH}" node && \
    rm "node-${NODEJS_VERSION}-${NODEJS_ARCH}.tar.xz" && \
    curl -L -O "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_${CADDY_ARCH}.tar.gz" && \
    mkdir /opt/caddy && \
    tar xpf "caddy_${CADDY_VERSION}_${CADDY_ARCH}.tar.gz" -C /opt/caddy

COPY --chown=${USER_ID}:${USER_ID} \
  ./sincromisor-client/package.json ./sincromisor-client/package-lock.json \
  ./README.md ./Docker/sincromisor-client-base/docker-entrypoint.sh \
  /opt/${USER_ID}/

USER $USER_ID
RUN cd /opt/sincromisor && \
  PATH=/opt/node/bin:${PATH} npm install

ENTRYPOINT [ "/opt/sincromisor/docker-entrypoint.sh" ]
# CMD ["/opt/sincromisor/start.sh"]
