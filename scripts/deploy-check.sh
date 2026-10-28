#!/usr/bin/env bash
# Valide un manifest de déploiement avec le validateur du repo infra (vision §20.4).
# Usage : scripts/deploy-check.sh [manifest]   (défaut : .deploy/manifest.yaml)
# INFRA_DIR : checkout de josias-koffi/infra (défaut : ~/perso/projets/infra).
set -uo pipefail

manifest="${1:-.deploy/manifest.yaml}"
infra="${INFRA_DIR:-$HOME/perso/projets/infra}"
validator="$infra/scripts/validate-manifest.py"

if [ ! -d "$infra" ]; then
    echo "deploy-check: INFRA_DIR introuvable ($infra). Définir INFRA_DIR sur un checkout de josias-koffi/infra." >&2
    exit 2
fi
if [ ! -f "$validator" ]; then
    echo "deploy-check: validate-manifest.py absent de $infra/scripts (INFRA_DIR doit pointer sur josias-koffi/infra)." >&2
    exit 2
fi
if [ ! -f "$manifest" ]; then
    echo "deploy-check: manifest introuvable ($manifest)." >&2
    exit 2
fi

# Le validateur importe jsonschema et yaml au chargement : test explicite pour un message clair.
if ! python3 -c 'import jsonschema, yaml' 2>/dev/null; then
    echo "deploy-check: dépendances Python manquantes (jsonschema, PyYAML). Lancer : pip install jsonschema PyYAML" >&2
    exit 2
fi

# Le validateur imprime lui-même « ✓ <chemin> » quand le manifest est valide.
python3 "$validator" "$manifest" || {
    echo "✗ $manifest" >&2
    exit 1
}
