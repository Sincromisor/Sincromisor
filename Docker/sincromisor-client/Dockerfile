FROM sincromisor-client-base:latest

EXPOSE 8002/tcp

ARG USER_ID=sincromisor
ENV PATH=/opt/node/bin:$PATH

COPY --chown=${USER_ID}:${USER_ID} \
    ./sincromisor-client/ /opt/${USER_ID}/sincromisor-client/

COPY --chown=${USER_ID}:${USER_ID} \
    ./config.yml \
    ./examples/Caddyfile.client \
    ./install-client-assets.sh \
    /opt/${USER_ID}/

RUN ln -s /opt/${USER_ID}/node_modules /opt/${USER_ID}/sincromisor-client/node_modules && \
    mv /opt/${USER_ID}/Caddyfile.client /opt/${USER_ID}/Caddyfile && \
    cd /opt/${USER_ID}/sincromisor-client && \
    mkdir -p public/mediapipe-wasm && \
    cp -r node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe-wasm && \
    NODE_OPTIONS="--max-old-space-size=2048" npm run build

ENTRYPOINT [ "/opt/sincromisor/docker-entrypoint.sh" ]
CMD ["/opt/caddy/caddy", "run"]
