FROM hashicorp/consul:latest AS consul

FROM redis:8

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

EXPOSE 6379

COPY --from=consul --chown=root:root --chmod=755 \
    /bin/consul \
    /bin/consul

RUN mkdir -p /usr/local/etc/redis && \
    chown redis:redis /usr/local/etc/redis && \
    chmod 2770 /usr/local/etc/redis

COPY --chown=root:root --chmod=755 \
    ./Docker/common/service-register.sh /service-register.sh
COPY --chown=root:root --chmod=755 \
    ./Docker/redis/start-redis.sh /start-redis.sh
COPY --chown=root:root --chmod=644 \
    ./Docker/redis/redis-template.json \
    /redis-template.json
COPY --chown=redis:redis \
    ./configs/redis.conf \
    /usr/local/etc/redis/redis.conf

CMD [ "/start-redis.sh" ]
