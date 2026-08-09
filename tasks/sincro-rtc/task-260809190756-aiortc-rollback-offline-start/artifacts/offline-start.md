# Offline startup verification

- Image build: `docker build -f Docker/sincro-rtc/Dockerfile -t sincro-rtc:offline-start-test .` — PASS
- Offline execution: `docker run --network none` with the default command —
  `/api/v1/RTCSignalingServer/statuses` returned `{"worker_type":"RTCSignalingServer","sessions":0}`.
- VPS再確認: `/tmp/sincromisor-gate4-rehearsal` で同じDockerfileを再buildし、
  `--network none` コンテナ内からendpointを問い合わせて同じ応答を得た。
- Repository gate: `npm run gate` — PASS (579 passed, 2 skipped).

`uv run --no-sync` uses the virtual environment prepared while building the image and cannot resolve
or download dependencies at startup.
