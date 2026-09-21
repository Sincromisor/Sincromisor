# 公式の固定版へHTTP死活確認用の静的BusyBoxだけを追加する。
FROM busybox:1.37.0-uclibc AS probe
FROM victoriametrics/victoria-logs:v1.52.0@sha256:47b820890d64c4575a2a0a46415dcd8a4fd59a0f1fcd6a377693d7aea639442e
COPY --from=probe /bin/busybox /busybox
