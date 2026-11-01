---
doc_version: 0.1.0
status: proposed
last_reviewed: 2026-11-01
covers_commit: bc6b7e3
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
| A. Chiffrement direct par la clé maître (AES-256-GCM), AAD `llm:v1:<organization_id>:<provider>`, `key_version` | Même modèle que ADR 0009 ; aucune colonne de plus ; au plus 3 lignes par organisation, rechiffrement trivial | Une rotation de la clé maître rechiffre toutes les lignes |
| B. Vraie enveloppe (DEK par ligne chiffrée par une KEK) | Rotation de la KEK sans toucher aux données ; alignée sur le vocabulaire de la vision | Deux colonnes (`wrapped_key`, `wrap_nonce`), plus de code et de cas d'erreur, sans gain tant que la clé maître est locale |
| C. KMS externe | Clé hors de l'application | Nouvelle dépendance et nouveau coût, hors périmètre (ADR requis) |
| D. Indice de clé affiché (derniers caractères) | Aide l'utilisateur à reconnaître la clé | Fuite partielle d'un secret ; refusé |

## Décision
Option A.
- Chiffrement AES-256-GCM direct par la clé maître ; AAD `llm:v1:<organization_id>:<provider>` **dérivée de la ligne, jamais stockée** : un chiffré copié vers une autre organisation ou un autre fournisseur ne se déchiffre pas.
- `key_version` (>= 1) identifie la clé maître utilisée. La **rotation** repose sur un porte-clés versionné (plusieurs clés maîtres actives, la plus récente chiffre, la version lit) à **construire en TK-52**, puis sur un rechiffrement de ≤ 3 lignes par organisation.
- **Aucun indice de la clé** (ni derniers caractères, ni empreinte) n'est stocké ni renvoyé.
- Le passage ultérieur à une vraie enveloppe est **additif** : deux colonnes (`wrapped_key`, `wrap_nonce`) et une `key_version` supérieure, sans migration destructive.

## Conséquences
- `llm_provider_credentials` a 12 colonnes, un `UNIQUE (organization_id, provider)` et des CHECK sur le nonce (12 octets), la version et la taille du chiffré.
- Les erreurs de base de cette table ne sont jamais journalisées brutes ; le journal serveur PostgreSQL (« Failing row contains ») ne doit être ni exposé ni exporté (voir `docs/quality-and-operations.md`).
- Si l'enveloppe stricte est exigée par le tech-lead ou le PO, TK-52 ajoute les deux colonnes avant toute donnée de production.
