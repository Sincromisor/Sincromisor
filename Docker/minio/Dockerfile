# hostname -i用
FROM busybox:latest AS busybox

FROM hashicorp/consul:latest AS consul

FROM minio/minio:latest

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

EXPOSE 9000/tcp
EXPOSE 9001/tcp

COPY --from=busybox --chown=root:root --chmod=755 \
    /bin/busybox \
    /bin/busybox
RUN busybox --install -s /usr/local/bin

COPY --from=consul --chown=root:root --chmod=755 \
    /bin/consul \
    /bin/consul

COPY --chown=root:root --chmod=755 \
    ./Docker/common/service-register.sh \
    /service-register.sh
COPY --chown=root:root --chmod=755 \
    ./Docker/minio/start-minio.sh \
    /start-minio.sh
COPY --chown=root:root --chmod=644 \
    ./Docker/minio/minio-template.json \
    /minio-template.json

ENTRYPOINT [ ]
CMD [ "/start-minio.sh" ]
