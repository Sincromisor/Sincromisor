# syntax=docker/dockerfile:1
FROM node:22 AS frontend-builder

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
USER ${SINCRO_USER_ID}
RUN --mount=type=cache,target=${SINCRO_USER_DIR}/.npm,uid=1001,gid=1001 \
    npm ci

RUN mkdir -p public/mediapipe-wasm && \
    cp -r node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe-wasm

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

RUN npm run build

FROM golang:1.26.8-bookworm AS pion-builder

WORKDIR /src/sincromisor-server/sincro-rtc

COPY ./sincromisor-server/sincro-rtc/go.mod ./sincromisor-server/sincro-rtc/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY ./sincromisor-server/sincro-rtc ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 go build -o /out/sincro-rtc ./cmd/sincro-rtc

FROM ubuntu:24.04 AS runner

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt/archives,sharing=locked \
    apt-get update && \
    apt-get install --no-install-recommends -y curl ffmpeg libopus0 && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR} && \
    chown ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

COPY --from=pion-builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    /out/sincro-rtc \
    ${SINCRO_USER_DIR}/sincro-rtc
COPY --from=frontend-builder --chown=${SINCRO_USER_ID}:${SINCRO_USER_ID} \
    /opt/sincromisor/sincromisor-frontend/dist \
    ${SINCRO_USER_DIR}/frontend

WORKDIR ${SINCRO_USER_DIR}
USER ${SINCRO_USER_ID}

EXPOSE 8080/tcp

ENTRYPOINT ["/opt/sincromisor/sincro-rtc"]
CMD ["--http", "0.0.0.0:8080", "--frontend-dir", "/opt/sincromisor/frontend", "--ffmpeg", "/usr/bin/ffmpeg"]
