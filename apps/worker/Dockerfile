# Image worker (TK-16, vision §20.4). Contexte = racine du dépôt : docker build -f apps/worker/Dockerfile .
# Le worker ne migre jamais le schéma ; aucune variable d'environnement n'est figée.

FROM node:24.22.1-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable \
    && corepack prepare pnpm@12.15.0 --activate \
    && npm install --global turbo@2.11.10

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune @koklo/worker --docker

FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@koklo/worker \
    && pnpm --filter @koklo/worker deploy --prod /deploy

FROM node:24.22.1-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /deploy/ ./
USER node
CMD ["node", "dist/main.js"]
