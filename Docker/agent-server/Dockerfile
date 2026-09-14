FROM node:24.18.1-bookworm-slim AS build
WORKDIR /app
ENV MASTRA_TELEMETRY_DISABLED=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24.18.1-bookworm-slim
WORKDIR /app
# Studioはページと同じURLを使い、コンテナの待受アドレスへブラウザーを接続させない。
ENV NODE_ENV=production \
    MASTRA_TELEMETRY_DISABLED=true \
    MASTRA_AUTO_REFRESH_PROVIDERS=false \
    MASTRA_AUTO_DETECT_URL=true \
    MASTRA_STUDIO_PATH=/app/.mastra/output/studio
# DBは管理者の設定と会話を含むため、サービスユーザーだけが読める専用領域に置く。
RUN install -d -m 700 -o node -g node /data
COPY --from=build --chown=node:node /app/.mastra/output ./.mastra/output
USER node
CMD ["node", ".mastra/output/index.mjs"]
