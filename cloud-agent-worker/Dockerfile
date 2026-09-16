FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates python3 ffmpeg bash \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
RUN npm install -g wrangler@latest
