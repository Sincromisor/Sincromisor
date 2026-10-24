# hostname -i用
FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac AS busybox

RUN apt-get update && \
    apt-get install -y busybox-static

FROM hashicorp/consul:2.1.0 AS consul

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
