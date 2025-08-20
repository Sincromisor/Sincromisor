FROM hashicorp/consul:latest AS consul

FROM node:22 AS builder

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}
ARG SINCRO_NODE_OPTIONS="--max-old-space-size=2048"
ENV NODE_OPTIONS=${SINCRO_NODE_OPTIONS}

WORKDIR ${SINCRO_USER_DIR}

RUN useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-frontend && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/package.json ./sincromisor-frontend/package-lock.json \
    ${SINCRO_USER_DIR}/sincromisor-frontend/

WORKDIR ${SINCRO_USER_DIR}/sincromisor-frontend
USER $SINCRO_USER_ID
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.npm,uid=1001,gid=1001 \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR} && \
    npm install

RUN \
    mkdir -p ${SINCRO_USER_DIR}/sincromisor-frontend/public/mediapipe-wasm && \
    cp -r ${SINCRO_USER_DIR}/sincromisor-frontend/node_modules/@mediapipe/tasks-vision/wasm/* \
    ${SINCRO_USER_DIR}/sincromisor-frontend/public/mediapipe-wasm

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/tsconfig.json \
    ./sincromisor-frontend/vite.config.js \
    ./sincromisor-frontend/postcss.config.js \
    ${SINCRO_USER_DIR}/sincromisor-frontend/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/src \
    ${SINCRO_USER_DIR}/sincromisor-frontend/src

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/public \
    ${SINCRO_USER_DIR}/sincromisor-frontend/public

RUN npm run build

FROM caddy:latest AS runner

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

EXPOSE 80/tcp

COPY --from=consul --chown=root:root \
    /bin/consul \
    /bin/consul

COPY --from=builder --chown=root:root \
    /opt/sincromisor/sincromisor-frontend/dist /srv/sincromisor-frontend

COPY --chown=root:root \
    ./configs/Caddyfile \
    /etc/caddy/Caddyfile

COPY --chown=root:root \
    ./Docker/sincro-frontend/frontend-template.json \
    /etc/caddy/frontend-template.json

COPY --chown=root:root \
    ./Docker/sincro-frontend/start-caddy.sh \
    /usr/local/bin/start-caddy.sh

RUN chmod 755 \
    /usr/local/bin/start-caddy.sh \
    /bin/consul

ENTRYPOINT ["/usr/local/bin/start-caddy.sh"]
CMD ["/usr/local/bin/start-caddy.sh"]
