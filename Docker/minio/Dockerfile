# hostname -i用
FROM busybox:latest AS busybox

FROM hashicorp/consul:latest AS consul

FROM minio/minio:latest

LABEL org.opencontainers.image.source=https://github.com/Sincromisor/Sincromisor

EXPOSE 9000/tcp
EXPOSE 9001/tcp

COPY --from=busybox --chown=root:root \
    /bin/busybox \
    /bin/busybox

COPY --from=consul --chown=root:root \
    /bin/consul \
    /bin/consul

COPY ./Docker/minio/minio-template.json /minio-template.json
COPY ./Docker/minio/start-minio.sh /start-minio.sh
RUN chmod 755 \
    /start-minio.sh /bin/busybox /bin/consul

ENTRYPOINT [ ]
CMD [ "/start-minio.sh" ]
