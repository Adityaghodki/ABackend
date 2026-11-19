FROM node:20-bookworm-slim

# Install runtime and build dependencies including ffmpeg and ffprobe
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

EXPOSE 8000

CMD ["node", "src/index.js"]