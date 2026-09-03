# ── TruckHOS Planner — frontend image ──────────────────────────────
# Stage 1: build the React + TypeScript app with Bun.
# Stage 2: serve the static bundle from nginx, proxying /api and /media
#          to the Django backend (docker-compose service name `backend`).

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

FROM nginx:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
