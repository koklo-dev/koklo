---
doc_version: 0.1.0
status: proposed
last_reviewed: 2026-11-01
covers_commit: 90f49d4
---
# 0013 — Stockage des clés BYOK : chiffrement direct par la clé maître, AAD dérivée de la ligne

- **Statut** : proposé (TK-51a ; ticket `sensitive`, entérinement humain requis)
- **Date** : 2026-11-01
- **Décideurs** : tech-lead, developer (ticket TK-51, décision D1)

## Contexte
La vision (§15) et TK-52 parlent de chiffrement « par enveloppe » des clés LLM fournies par les organisations (BYOK). Le code chiffre déjà les jetons utilisateur de fournisseur directement avec la clé maître, avec une version de clé et une AAD dérivée de la ligne (ADR 0009, `provider_user_credentials`). Il faut fixer le modèle de `llm_provider_credentials` avant d'écrire le service de TK-52.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Chiffrement direct par la clé maître (AES-256-GCM), AAD `llm:v1:<organization_id>:<provider>`, `key_version` | Même modèle que `provider_user_credentials` (migration 20261031130000, jetons utilisateur chiffrés avec la clé maître) ; aucune colonne de plus ; au plus 3 lignes par organisation, rechiffrement trivial | Une rotation de la clé maître rechiffre toutes les lignes |
| B. Vraie enveloppe (DEK par ligne chiffrée par une KEK) | Rotation de la KEK sans toucher aux données ; alignée sur le vocabulaire de la vision | Deux colonnes (`wrapped_key`, `wrap_nonce`), plus de code et de cas d'erreur, sans gain tant que la clé maître est locale |
| C. KMS externe | Clé hors de l'application | Nouvelle dépendance et nouveau coût, hors périmètre (ADR requis) |
| D. Indice de clé affiché (derniers caractères) | Aide l'utilisateur à reconnaître la clé | Fuite partielle d'un secret ; refusé |

## Décision
Option A.
- Chiffrement AES-256-GCM direct par la clé maître ; AAD `llm:v1:<organization_id>:<provider>` **dérivée de la ligne, jamais stockée** : un chiffré copié vers une autre organisation ou un autre fournisseur ne se déchiffre pas.
- `key_version` (>= 1) identifie la clé maître utilisée. La **rotation** repose sur un porte-clés versionné (plusieurs clés maîtres actives, la plus récente chiffre, la version lit) **construit en TK-52a** (`createKeyRing`, voir « Amendement »), puis sur un rechiffrement de ≤ 3 lignes par organisation.
- **Aucun indice de la clé** (ni derniers caractères, ni empreinte) n'est stocké ni renvoyé.
- Le passage ultérieur à une vraie enveloppe est **additif** : deux colonnes (`wrapped_key`, `wrap_nonce`) et une `key_version` supérieure, sans migration destructive.

## Conséquences
- `llm_provider_credentials` a 12 colonnes, un `UNIQUE (organization_id, provider)` et des CHECK sur le nonce (12 octets), la version et la taille du chiffré.
- Les erreurs de base de cette table ne sont jamais journalisées brutes ; le journal serveur PostgreSQL (« Failing row contains ») ne doit être ni exposé ni exporté (voir `docs/quality-and-operations.md`).
- Si l'enveloppe stricte est exigée par le tech-lead ou le PO, TK-52 ajoute les deux colonnes avant toute donnée de production.

## Amendement (TK-52a, 2026-11-01) : porte-clés et variables
Le porte-clés est livré derrière l'interface `TokenCipher` existante (`apps/api/src/crypto/key-ring.ts`) ; la décision (option A) ne change pas.
- `createKeyRing({ current, previous })` : la clé courante chiffre et porte sa version ; le déchiffrement choisit la clé par `key_version`. Version inconnue ou autre clé : `TokenDecryptionError`, jamais de repli. Versions entières >= 1, uniques, la courante strictement supérieure aux précédentes (`KeyRingConfigError`, sans clé dans le message).
- Variables : `KOKLO_ENCRYPTION_KEY` (clé courante, inchangée), `KOKLO_ENCRYPTION_KEY_VERSION` (entier >= 1, défaut 1), `KOKLO_ENCRYPTION_KEYS_PREVIOUS` (`version:clé`, séparées par des virgules). Sans variable supplémentaire : version 1, aucune précédente, comportement identique à avant.
- Le même porte-clés sert les jetons utilisateur (`PrismaUserCredentials`) : les jetons en v1 restent lisibles après le passage en v2.
- Toute erreur de la base sur cette table est réécrite en `LlmCredentialStoreError` sans cause (voir `docs/quality-and-operations.md`).
- Le rechiffrement des lignes et la procédure de rotation sont livrés en TK-52c (amendement suivant). Statut inchangé : **proposé**.

## Amendement (TK-52c, 2026-11-01) : rotation de la clé maître
- Commande : `pnpm --filter @koklo/api rotate:encryption-key [--dry-run] [--json]` (`apps/api/src/cli/rotate-encryption-key.ts`, fonction `rotateEncryptionKey`). Elle rechiffre avec la clé courante les DEUX tables chiffrées, toutes organisations (client brut, usage d'administration borné à ces deux tables), avec les mêmes AAD que l'application (`llm:v1:<organisation>:<fournisseur>` ; `<utilisateur>:<installation>`).
- Idempotente (les lignes déjà en version courante ne sont pas touchées), atomique par ligne (une instruction avec compare-and-swap sur id, version, chiffré et nonce ; une écriture normale concurrente gagne et est comptée en conflit), sans audit, sans toucher `provider_auth_states`. Une ligne illisible est comptée en échec et laissée intacte.
- Sortie : comptes uniquement ; codes 0 (à jour), 1 (ligne en échec ou panne), 2 (refus : usage, configuration, lignes anciennes sans clé précédente). Aucune valeur, clé, AAD ou identifiant dans la sortie, les journaux ou les erreurs.
- Procédure (`docs/quality-and-operations.md`) : nouvelle clé, déploiement `KOKLO_ENCRYPTION_KEY`/`_VERSION` n+1/`_KEYS_PREVIOUS` `n:ancienne`, essai puis rotation réelle, vérification `key_version <> n+1` = 0 sur les deux tables, retrait de la clé précédente, sauvegarde de la clé maître hors base. Point ouvert (infra, hors dépôt) : `KOKLO_ENCRYPTION_KEY` est dans `lockedSecrets` du manifeste de déploiement, la rotation réelle exige un moyen d'écraser une valeur verrouillée.
- Statut inchangé : **proposé**.
