FROM hashicorp/consul:latest AS consul

FROM redis:8

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

EXPOSE 6379

COPY --from=consul --chown=root:root \
    /bin/consul \
    /bin/consul

RUN mkdir -p /usr/local/etc/redis && \
    chown redis:redis /usr/local/etc/redis && \
    chmod 2770 /usr/local/etc/redis

COPY ./Docker/redis/redis-template.json /redis-template.json
COPY ./Docker/redis/start-redis.sh /start-redis.sh
COPY --chown=redis:redis ./configs/redis.conf /usr/local/etc/redis/redis.conf
RUN chmod 755 \
    /start-redis.sh /bin/consul

CMD [ "/start-redis.sh" ]
