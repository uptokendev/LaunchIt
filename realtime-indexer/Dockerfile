# Use a Debian/Ubuntu-based image (has predictable CA behavior)
FROM node:20-bookworm-slim

# Install CA certificates (critical)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better caching)
COPY realtime-indexer/package*.json ./
RUN npm ci

# Copy source
COPY realtime-indexer/ ./

# Build (if you build TS -> dist)
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Adjust if your start script differs
CMD ["npm", "run", "start"]