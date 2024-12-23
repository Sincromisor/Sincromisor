#!/bin/sh

set -x
set -e

chmod 644 /opt/sincromisor/configs/config.yml

mkdir -p /volumes/sincro-cache
mkdir -p /volumes/sincro-voice
mkdir -p /volumes/consul-data

chown -R sincromisor:sincromisor /volumes/sincro-cache
chown -R sincromisor:sincromisor /volumes/sincro-voice

stat /opt/sincromisor/configs/config.yml
stat /volumes/sincro-cache
stat /volumes/sincro-voice
stat /volumes/consul-data
