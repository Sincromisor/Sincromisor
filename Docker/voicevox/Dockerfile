# syntax=docker/dockerfile:1
FROM hashicorp/consul@sha256:1c59f007df8ea1c21b2558dc73ef8d99047bc895d9e52e635d1e745e35fe9a54 AS consul

FROM python:3.14.6-slim-bookworm AS source
ARG ENGINE_REVISION=563a6889263a3b8caa6852497a2f83fa25d88801
WORKDIR /opt/voicevox_engine
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends git ca-certificates
# ローカルの作業コピーを使わず、公開forkの完全なコミットを検証して取得する。
RUN git init . && git remote add origin https://github.com/Sincromisor/voicevox_engine.git \
    && git fetch --depth 1 origin "$ENGINE_REVISION" && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "$ENGINE_REVISION" \
    && printf '%s\n' "$ENGINE_REVISION" > ENGINE_REVISION

FROM python:3.14.6-slim-bookworm AS build
WORKDIR /opt/voicevox_engine
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
ENV UV_PYTHON_PREFERENCE=only-system UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git curl ca-certificates unzip libsndfile1 libgomp1
COPY --from=source /opt/voicevox_engine/pyproject.toml /opt/voicevox_engine/uv.lock ./
# pyopenjtalkのC++拡張でlibstdc++へのリンクが欠落するため、明示してビルドする。
RUN --mount=type=cache,id=voicevox-streaming-uv-cxx,target=/root/.cache/uv \
    LDFLAGS="-Wl,--no-as-needed -lstdc++" uv sync --frozen --no-dev
# 辞書もビルド時に取得し、起動後のダウンロードとパッケージへの書き込みを避ける。
RUN .venv/bin/python -c 'import pyopenjtalk; pyopenjtalk.run_frontend("音声合成の検証です。")'

# Engine向けの区間生成APIはCore 0.17.0の配布物に含まれる。
RUN <<'SH'
set -eu
mkdir -p /opt/voicevox/model /opt/voicevox/onnxruntime
curl -fL --retry 3 -o /tmp/core.zip https://github.com/VOICEVOX/voicevox_core/releases/download/0.17.0/voicevox_core-linux-x64-0.17.0.zip
echo '00a80c5688e2fde093a3e2c1a4c39170b1c86760d92638a554c8a971a9d97077  /tmp/core.zip' | sha256sum -c -
unzip -q /tmp/core.zip -d /tmp/core
cp /tmp/core/*/lib/libvoicevox_core.so /opt/voicevox/
# Core配布物のライセンスと説明を共有ライブラリーと一緒に保持する。
mkdir -p /opt/voicevox/licenses/core
find /tmp/core -type f ! -path '*/lib/*' -exec cp --parents '{}' /opt/voicevox/licenses/core/ \;
curl -fL --retry 3 -o /tmp/onnxruntime.tgz https://github.com/VOICEVOX/onnxruntime-builder/releases/download/voicevox_onnxruntime-1.23.2/voicevox_onnxruntime-linux-x64-1.23.2.tgz
echo '0860cfbd5a80201b1bf95cae13ca2db8dc01f32f5674cc8193146047a9212fdb  /tmp/onnxruntime.tgz' | sha256sum -c -
tar -xzf /tmp/onnxruntime.tgz --strip-components=1 -C /opt/voicevox/onnxruntime
ln -sf libvoicevox_onnxruntime.so.1.23.2 /opt/voicevox/onnxruntime/lib/libvoicevox_onnxruntime.so
curl -fL --retry 3 -o /opt/voicevox/model/0.vvm https://github.com/VOICEVOX/voicevox_vvm/releases/download/0.17.0/0.vvm
echo 'ecd35374d4182cd883cba5040376f7f888cc6ba248b1c2f4cea07cdb34bb1318  /opt/voicevox/model/0.vvm' | sha256sum -c -
SH
COPY --from=source /opt/voicevox_engine/voicevox_engine ./voicevox_engine
COPY --from=source /opt/voicevox_engine/resources ./resources
COPY --from=source /opt/voicevox_engine/tools ./tools
COPY --from=source /opt/voicevox_engine/run.py /opt/voicevox_engine/engine_manifest.json /opt/voicevox_engine/ENGINE_REVISION /opt/voicevox_engine/LGPL_LICENSE ./
# 実モデルの話者メタ情報と利用規約を公式リソースから取り込む。
RUN git init /tmp/voicevox_resource \
    && git -C /tmp/voicevox_resource remote add origin https://github.com/VOICEVOX/voicevox_resource \
    && git -C /tmp/voicevox_resource fetch --depth 1 origin a831d3834f517a9093ccb34e96527801708068bb \
    && git -C /tmp/voicevox_resource checkout --detach FETCH_HEAD \
    && DOWNLOAD_RESOURCE_PATH=/tmp/voicevox_resource bash tools/process_voicevox_resource.bash \
    && .venv/bin/python tools/generate_filemap.py --target_dir resources/character_info \
    && cp /tmp/voicevox_resource/engine/README.md ./README.md
# 配布元の基点と混同しないよう、マニフェストにも取得した独自版を記録する。
RUN .venv/bin/python -c 'import json; from pathlib import Path; p=Path("engine_manifest.json"); m=json.loads(p.read_text()); m["version"]="0.25.2+streaming."+Path("ENGINE_REVISION").read_text().strip(); p.write_text(json.dumps(m, ensure_ascii=False))'

# 上流の一覧には未導入のGPU依存と旧Python版があるため、今回の配布物から生成する。
COPY Docker/voicevox/generate-licenses.py /tmp/generate-licenses.py
RUN .venv/bin/python /tmp/generate-licenses.py

FROM python:3.14.6-slim-bookworm AS runtime
WORKDIR /opt/voicevox_engine
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends libsndfile1 libgomp1 libstdc++6 ca-certificates \
    && useradd --create-home --uid 10001 voicevox \
    && install -d -o voicevox -g voicevox /home/voicevox/.local
COPY --from=build /opt/voicevox /opt/voicevox
COPY --from=build /opt/voicevox_engine/.venv ./.venv
COPY --from=build --chown=10001:10001 /opt/voicevox_engine/voicevox_engine ./voicevox_engine
COPY --from=build --chown=10001:10001 /opt/voicevox_engine/resources ./resources
COPY --from=build /opt/voicevox_engine/run.py /opt/voicevox_engine/engine_manifest.json /opt/voicevox_engine/ENGINE_REVISION /opt/voicevox_engine/LGPL_LICENSE /opt/voicevox_engine/README.md ./
COPY --from=source /opt/voicevox_engine/LICENSE ./
ARG ENGINE_REVISION=563a6889263a3b8caa6852497a2f83fa25d88801
LABEL org.opencontainers.image.source="https://github.com/Sincromisor/Sincromisor" \
      dev.sincromisor.voicevox.engine.repository="https://github.com/Sincromisor/voicevox_engine" \
      dev.sincromisor.voicevox.engine.revision=$ENGINE_REVISION
ENV LD_LIBRARY_PATH=/opt/voicevox/onnxruntime/lib \
    VV_MODELS_ROOT_DIR=/opt/voicevox/model PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    SINCRO_VOICEVOX_HOST=0.0.0.0 SINCRO_VOICEVOX_PORT=50021 \
    SINCRO_CONSUL_AGENT_HOST=consul-agent-synthesizer SINCRO_CONSUL_AGENT_PORT=8500
COPY --from=consul --chmod=755 /bin/consul /bin/consul
COPY --chmod=755 Docker/common/service-register.sh /service-register.sh
COPY --chmod=755 Docker/voicevox/start-voicevox.sh /start-voicevox.sh
COPY --chown=10001:10001 Docker/voicevox/voicevox-template.json /home/voicevox/.local/voicevox-template.json
USER 10001:10001
EXPOSE 50021
CMD ["/start-voicevox.sh"]
