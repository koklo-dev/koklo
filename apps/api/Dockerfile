# Image api (TK-16, vision §20.4). Contexte = racine du dépôt : docker build -f apps/api/Dockerfile .
# Aucune variable d'environnement n'est figée : tout est lu à l'exécution (image promouvable).

FROM node:24.22.1-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable \
    && corepack prepare pnpm@12.15.0 --activate \
    && npm install --global turbo@2.11.10

# 1. Sous-ensemble du monorepo nécessaire à l'api (manifestes séparés des sources pour le cache).
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune @koklo/api --docker

# 2. Dépendances puis build (prisma generate + tsc, via turbo).
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@koklo/api \
    && pnpm --filter @koklo/api deploy --prod /deploy \
    # Outil de migration : prisma CLI à la version de @koklo/db, isolé de l'application.
    && mkdir /migrate \
    && cp -r packages/db/prisma packages/db/prisma.config.ts /migrate/ \
    && cd /migrate \
    && npm init -y >/dev/null \
    && npm install --omit=dev --ignore-scripts=false "prisma@$(node -p "require('/repo/packages/db/package.json').devDependencies.prisma")"

# 3. Image finale : runtime seul, utilisateur non-root, aucun fichier .env.
FROM node:24.22.1-alpine AS runner
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=builder --chown=node:node /deploy/ ./
COPY --from=builder --chown=node:node /migrate /opt/migrate
COPY --chown=node:node apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0555 /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
