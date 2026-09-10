FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @crosspilot/db run generate
RUN pnpm --filter @crosspilot/shared run build
RUN pnpm --filter @crosspilot/domain run build
RUN pnpm --filter @crosspilot/integrations run build
RUN pnpm --filter @crosspilot/db run build
RUN pnpm --filter @crosspilot/worker run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app /app

CMD ["node", "apps/worker/dist/main.js"]
