# 起票レビュー

判定: APPROVED

Consul設定名、Python互換service ID、listener bind → non-ready register → ready publish の起動順、draining直後の並行deregisterと2秒上限が一意である。既存Caddyの stable endpoint と pipeline resolver の fallback契約に整合する。
