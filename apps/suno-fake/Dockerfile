# Build from apps/suno-fake (no monorepo packages required at runtime).
# Staging only — do not deploy to production.

FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json ./
RUN pnpm install

COPY tsconfig.json ./
COPY src ./src

ENV PORT=4010
EXPOSE 4010

CMD ["pnpm", "start"]
