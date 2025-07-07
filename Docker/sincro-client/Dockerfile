FROM hashicorp/consul:latest AS consul

FROM node:22 AS builder

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}
ARG SINCRO_NODE_OPTIONS="--max-old-space-size=2048"
ENV NODE_OPTIONS=${SINCRO_NODE_OPTIONS}

WORKDIR ${SINCRO_USER_DIR}

RUN useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-client && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-client/package.json ./sincromisor-client/package-lock.json \
    ${SINCRO_USER_DIR}/sincromisor-client/

WORKDIR ${SINCRO_USER_DIR}/sincromisor-client
USER $SINCRO_USER_ID
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.npm,uid=1001,gid=1001 \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR} && \
    npm install

RUN \
    mkdir -p ${SINCRO_USER_DIR}/sincromisor-client/public/mediapipe-wasm && \
    cp -r ${SINCRO_USER_DIR}/sincromisor-client/node_modules/@mediapipe/tasks-vision/wasm/* \
    ${SINCRO_USER_DIR}/sincromisor-client/public/mediapipe-wasm

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-client/tsconfig.json \
    ./sincromisor-client/vite.config.js \
    ./sincromisor-client/postcss.config.js \
    ${SINCRO_USER_DIR}/sincromisor-client/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-client/src \
    ${SINCRO_USER_DIR}/sincromisor-client/src

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-client/public \
    ${SINCRO_USER_DIR}/sincromisor-client/public

RUN npm run build

FROM caddy:latest AS runner

EXPOSE 80/tcp

COPY --from=consul --chown=root:root \
    /bin/consul \
    /bin/consul

COPY --from=builder --chown=root:root \
    /opt/sincromisor/sincromisor-client/dist /srv/sincromisor-client

COPY --chown=root:root \
    ./configs/Caddyfile \
    /etc/caddy/Caddyfile

COPY --chown=root:root \
    ./Docker/sincro-client/frontend-template.json \
    /etc/caddy/frontend-template.json

COPY --chown=root:root \
    ./Docker/sincro-client/start-caddy.sh \
    /usr/local/bin/start-caddy.sh

RUN chmod 755 \
    /usr/local/bin/start-caddy.sh \
    /bin/consul

ENTRYPOINT ["/usr/local/bin/start-caddy.sh"]
CMD ["/usr/local/bin/start-caddy.sh"]
