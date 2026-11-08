
# ============================================================
# Frontend build
# ============================================================
FROM node:22-bookworm-slim AS frontend-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/frontend

RUN corepack enable \
    && corepack prepare pnpm@12.15.0 --activate

# Use pinned local copies of external Git dependencies
COPY vendor/import-aseprite/ /tmp/import-aseprite/
COPY vendor/safe-gl/ /tmp/safe-gl/

# Build safe-gl package (generates dist/SafeGL.js)
RUN cd /tmp/safe-gl \
    && pnpm install --no-frozen-lockfile --ignore-workspace --allow-build=esbuild

# Copy frontend source
COPY frontend/ ./

# Replace Git dependencies with local paths
RUN node -e '\
const fs = require("fs"); \
const p = JSON.parse(fs.readFileSync("package.json", "utf8")); \
p.dependencies["import-aseprite"] = "file:/tmp/import-aseprite"; \
p.dependencies["safe-gl"] = "file:/tmp/safe-gl"; \
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");'

# Install dependencies and regenerate build-local lockfile
RUN pnpm install --no-frozen-lockfile --reporter=append-only

# Install esbuild
RUN pnpm add -D esbuild

# Compile Vite plugins from TypeScript to JavaScript
RUN ./node_modules/.bin/esbuild /tmp/safe-gl/import-glsl/vite.ts \
      --format=esm --platform=node \
      --outfile=node_modules/safe-gl/import-glsl/vite.js \
    && ./node_modules/.bin/esbuild /tmp/import-aseprite/vite.ts \
      --format=esm --platform=node \
      --outfile=node_modules/import-aseprite/vite.js \
    && sed -i \
      -e 's|safe-gl/import-glsl/vite|safe-gl/import-glsl/vite.js|' \
      -e 's|import-aseprite/vite|import-aseprite/vite.js|' \
      vite.config.ts

# Build frontend
RUN pnpm build


# ============================================================
# Backend build
# ============================================================
FROM node:22-bookworm-slim AS backend-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

RUN corepack enable \
    && corepack prepare pnpm@12.15.0 --activate

COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY backend/ ./

# Production backend build
RUN pnpm exec node build.mjs


# ============================================================
# Runtime
# ============================================================
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8999
ENV FRONTENDPATH=/app/frontend/dist
ENV LOCALES_DIR=/app/locales

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    yt-dlp \
    geoip-bin \
    geoip-database \
    lsof \
    libffi8 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Backend runtime dependencies
COPY --from=backend-build --chown=node:node \
    /app/backend/node_modules ./node_modules

# Compiled backend
COPY --from=backend-build --chown=node:node \
    /app/backend/dist ./dist

# Compiled frontend
COPY --from=frontend-build --chown=node:node \
    /app/frontend/dist /app/frontend/dist

# Persistent data directories
RUN mkdir -p assets comic replays \
    && chown -R node:node /app/backend

USER node

EXPOSE 8999

CMD ["node", "./dist/main.js"]
