# 公式の固定版へHTTP死活確認用の静的BusyBoxだけを追加する。
FROM busybox:1.38.0-uclibc AS probe
FROM victoriametrics/victoria-logs:v1.53.0@sha256:251121fa882af99b95ba0c230a4a2f412ea602d2698c64a96c58dc9842bb755d
COPY --from=probe /bin/busybox /busybox
