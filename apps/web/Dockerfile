# Image web (TK-16, vision §20.4). Contexte = racine du dépôt : docker build -f apps/web/Dockerfile .
# Aucun NEXT_PUBLIC_* ni URL d'environnement au build : API_URL, APP_ENV… sont lus à l'exécution.

FROM node:24.22.1-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable \
    && corepack prepare pnpm@12.15.0 --activate \
    && npm install --global turbo@2.11.10

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune @koklo/web --docker

FROM base AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@koklo/web

# Sortie `standalone` de Next : serveur et dépendances tracées uniquement.
FROM node:24.22.1-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
