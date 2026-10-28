#!/bin/sh
# Applique les migrations en attente, puis démarre l'api. Une migration en échec arrête le
# conteneur (code non nul) : l'api ne démarre jamais sur un schéma incohérent.
# Le worker ne migre jamais : seule l'api possède ce démarrage.
set -eu
(cd /opt/migrate && ./node_modules/.bin/prisma migrate deploy --config ./prisma.config.ts)
exec "$@"
