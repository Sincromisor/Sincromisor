FROM sincromisor-client-base:latest

EXPOSE 8002/tcp

ARG USER_ID=sincromisor
ENV PATH=/opt/node/bin:$PATH

COPY --chown=${USER_ID}:${USER_ID} \
    ./sincromisor-client/ /opt/${USER_ID}/sincromisor-client/

COPY --chown=${USER_ID}:${USER_ID} \
    ./examples/config.yml \
    ./examples/caddy.json \
    ./install-client-assets.sh \
    /opt/${USER_ID}/

RUN ln -s /opt/sincromisor/node_modules /opt/sincromisor/sincromisor-client/node_modules && \
    cd /opt/sincromisor/sincromisor-client && \
    npm run build

ENTRYPOINT [ "/opt/sincromisor/docker-entrypoint.sh" ]
# CMD ["/opt/sincromisor/start.sh"]
