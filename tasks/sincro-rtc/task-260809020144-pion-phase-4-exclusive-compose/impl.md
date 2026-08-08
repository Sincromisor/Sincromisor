# 実装メモ

- 実起動では host UDP 3478 が既存プロセスにより使用中だったため、`SINCRO_PION_MEDIA_UDP_PORT=3479` の一時上書きでPion起動とTCP 8001の排他・aiortc復旧を確認した。既定3478のhost空き確認は対象環境で別途必要である。
