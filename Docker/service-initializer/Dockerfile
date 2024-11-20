FROM ubuntu:24.04

ARG SINCRO_USER_ID=sincromisor
ARG SINCRO_USER_DIR=/opt/${SINCRO_USER_ID}

WORKDIR ${SINCRO_USER_DIR}

COPY ./Docker/service-initializer/initialize.sh ${SINCRO_USER_DIR}

RUN \
    useradd -u 1001 -s /bin/bash -d ${SINCRO_USER_DIR} ${SINCRO_USER_ID} && \
    mkdir ${SINCRO_USER_DIR}/sincromisor-server && \
    mkdir ${SINCRO_USER_DIR}/configs && \
    chown -R ${SINCRO_USER_ID}:${SINCRO_USER_ID} ${SINCRO_USER_DIR}

VOLUME ["/opt/sincromisor/.cache"]
CMD ["/opt/sincromisor/initialize.sh"]
