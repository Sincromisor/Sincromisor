# 未確認範囲と再開条件

このホストはmacOS arm64で、DockerとCUDA実行環境がない。NeMoをホストへ強制導入せず、全依存はLinux向けの導入計画まで確認した。NeMoの3試験は`nemo`未導入で収集できず、全体tyも同じ依存不足で解決できない。GPU不要の範囲は59試験とtyが成功した。

Dockerと既存CUDAコンテナが使える環境で、`uv sync --locked --group dev --group full`、全体ty、NeMo試験、既存認識経路の音声1件、Linux上のAudioClassifierを確認して完了する。依存解決やMediaPipe単体の成功を認識系全体の成功とは扱わない。
