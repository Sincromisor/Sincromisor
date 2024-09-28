FROM sincromisor-server-base:latest

EXPOSE 8001/tcp 8003/tcp 8004/tcp 8005/tcp

ARG USER_ID=sincromisor

COPY --chown=${USER_ID}:${USER_ID} \
    ./sincromisor-server/ /opt/${USER_ID}/sincromisor-server/

COPY --chown=${USER_ID}:${USER_ID} \
    ./config.yml ./start-server.sh ./install-server-assets.sh \
    /opt/${USER_ID}/

VOLUME ["/opt/sincromisor/.cache"]
ENTRYPOINT [ "/opt/sincromisor/docker-entrypoint.sh" ]
CMD ["/opt/sincromisor/start-server.sh"]
