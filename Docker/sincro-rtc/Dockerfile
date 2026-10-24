# syntax=docker/dockerfile:1
FROM node:26.12.1 AS frontend-builder

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}
ARG SINCRO_NODE_OPTIONS="--max-old-space-size=2048"
ENV NODE_OPTIONS=${SINCRO_NODE_OPTIONS}

WORKDIR ${SINCRO_USER_DIR}

RUN useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-frontend && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/package.json \
    ${SINCRO_USER_DIR}/sincromisor-frontend/

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} package.json package-lock.json .npmrc ${SINCRO_USER_DIR}/
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} scripts/check-node-version.mjs ${SINCRO_USER_DIR}/scripts/
RUN npm install --global npm@11.21.1

USER ${SINCRO_USER_ID}
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.npm,uid=1001,gid=1001 \
    npm ci

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/tsconfig.json \
    ./sincromisor-frontend/tsconfig.modern.json \
    ./sincromisor-frontend/vite.config.js \
    ./sincromisor-frontend/postcss.config.js \
    ${SINCRO_USER_DIR}/sincromisor-frontend/
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/src \
    ${SINCRO_USER_DIR}/sincromisor-frontend/src
COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/public \
    ${SINCRO_USER_DIR}/sincromisor-frontend/public

COPY --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    ./sincromisor-frontend/scripts \
    ${SINCRO_USER_DIR}/sincromisor-frontend/scripts

RUN npm run build

FROM golang:1.26.10-bookworm AS pion-builder

WORKDIR /src/sincromisor-server/sincro-rtc

COPY ./sincromisor-server/sincro-rtc/go.mod ./sincromisor-server/sincro-rtc/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY ./sincromisor-server/sincro-rtc ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 go build -o /out/sincro-rtc ./cmd/sincro-rtc

FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac AS runner

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

# 基底イメージの自動削除を解除し、取得済みdebを排他キャッシュへ保持する。
RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates curl ffmpeg libopus0 && \
    useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR} && \
    chown ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

COPY --from=pion-builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    /out/sincro-rtc \
    ${SINCRO_USER_DIR}/sincro-rtc
COPY --from=pion-builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    /src/sincromisor-server/sincro-rtc/assets \
    ${SINCRO_USER_DIR}/assets
COPY --from=frontend-builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    /opt/sincromisor/sincromisor-frontend/dist \
    ${SINCRO_USER_DIR}/frontend

WORKDIR ${SINCRO_USER_DIR}
USER ${SINCRO_USER_ID}

EXPOSE 8080/tcp

ENTRYPOINT ["/opt/sincromisor/sincro-rtc"]
CMD ["--http", "0.0.0.0:8080", "--frontend-dir", "/opt/sincromisor/frontend", "--ffmpeg", "/usr/bin/ffmpeg"]
