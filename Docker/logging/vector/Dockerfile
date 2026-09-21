FROM timberio/vector:0.58.0-debian AS vector
# journalctl 250〜257はfollowで現在bootへ限定されるため、258以降を持つLTSを使う。
FROM ubuntu:26.04
RUN apt-get update && apt-get install -y --no-install-recommends systemd ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && journalctl --version | head -1
COPY --from=vector /usr/bin/vector /usr/bin/vector
ENTRYPOINT ["/usr/bin/vector"]
